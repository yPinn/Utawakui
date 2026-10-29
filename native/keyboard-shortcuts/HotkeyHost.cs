using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

// Registration-only protocol host. No hooks, raw input, arbitrary paths or
// keyboard stream. Only the owner thread may touch native registrations.
internal static class HotkeyHost {
  [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] private struct Message {
    public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam;
    public uint Time; public Point Position; public uint Private;
  }
  private sealed class Slot { public int Id; public uint Modifiers, Key; public string Token; public bool Active; }
  [DllImport("user32.dll", SetLastError=true)] private static extern bool RegisterHotKey(IntPtr window,int id,uint modifiers,uint key);
  [DllImport("user32.dll", SetLastError=true)] private static extern bool UnregisterHotKey(IntPtr window,int id);
  [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] private static extern int GetMessage(out Message message,IntPtr window,uint min,uint max);
  [DllImport("user32.dll")] private static extern bool PeekMessage(out Message message,IntPtr window,uint min,uint max,uint remove);
  [DllImport("user32.dll", SetLastError=true)] private static extern bool PostThreadMessage(uint thread,uint message,UIntPtr wParam,IntPtr lParam);
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] private static extern uint GetCurrentProcessId();
  [DllImport("kernel32.dll", SetLastError=true)] private static extern IntPtr OpenProcess(uint access,bool inherit,uint processId);
  [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] private static extern IntPtr GetThreadDesktop(uint thread);
  [DllImport("user32.dll")] private static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder result,uint length,out uint needed);

  private const uint Hotkey=0x0312, Wake=0x8001;
  private static readonly string Instance=Guid.NewGuid().ToString("N");
  private static readonly BlockingCollection<string> Commands=new BlockingCollection<string>(32);
  private static readonly BlockingCollection<string> Output=new BlockingCollection<string>(256);
  private static readonly Dictionary<string,Slot> Slots=new Dictionary<string,Slot>();
  private static readonly Dictionary<int,Slot> NativeIds=new Dictionary<int,Slot>();
  private static volatile bool Stopping;
  private static uint Owner;
  private static int NextId=1;
  private static long Generation, Sequence, LastRequest;

  private static void Stop() { Stopping=true; PostThreadMessage(Owner,Wake,UIntPtr.Zero,IntPtr.Zero); }
  private static void Emit(string line) { if(!Output.TryAdd(line))Stop(); }
  private static void Ack(long request,string result) { Emit("ack\t"+Instance+"\t"+request.ToString(CultureInfo.InvariantCulture)+"\t"+result); }
  private static bool Token(string value) { Guid parsed; return (value.Length==32||value.Length==36)&&Guid.TryParseExact(value,value.Length==32?"N":"D",out parsed); }
  private static bool Number(string value,out long parsed) { return long.TryParse(value,NumberStyles.None,CultureInfo.InvariantCulture,out parsed)&&parsed>0&&parsed<=9007199254740991L; }
  private static int ArmState(uint modifiers,uint key) {
    // A bounded arming snapshot, never release history or an input monitor.
    IntPtr input=OpenInputDesktop(0,false,1); if(input==IntPtr.Zero)return -1;
    try {
      uint needed;var active=new StringBuilder(128);var own=new StringBuilder(128);
      if(!GetUserObjectInformation(input,2,active,256,out needed)||!GetUserObjectInformation(GetThreadDesktop(Owner),2,own,256,out needed)||active.ToString()!=own.ToString())return -1;
      return GetAsyncKeyState((int)key)>=0&&((modifiers&2)==0||GetAsyncKeyState(0x11)>=0)&&((modifiers&1)==0||GetAsyncKeyState(0x12)>=0)&&((modifiers&4)==0||GetAsyncKeyState(0x10)>=0)?1:0;
    } finally { CloseDesktop(input); }
  }
  private static bool KeyAllowed(uint modifiers,uint key) {
    if((modifiers&~7u)!=0||(modifiers&3)==0||(modifiers&3)==3)return false;
    if(!((key>=48&&key<=57)||(key>=65&&key<=90)||(key>=32&&key<=40)||key==121||key==122))return false;
    if((modifiers&2)!=0&&key>=65&&key<=90&&"ACFHLNOPRSTVWXYZ".IndexOf((char)key)>=0)return false;
    return !((modifiers&1)!=0&&key==32);
  }
  private static bool DrainHotkeys() {
    Message ignored;
    for(int count=0;count<1024;count++)if(!PeekMessage(out ignored,IntPtr.Zero,Hotkey,Hotkey,1))return true;
    return false;
  }
  private static void Command(string line) {
    string[] p=line.Split('\t');long id;
    if(p.Length<3||p[0]!="1"||!Number(p[1],out id)||id>1000000000L||id<=LastRequest){Stop();return;}
    LastRequest=id;
    if(p[2]=="register"&&p.Length==6) {
      uint modifiers,key;
      if(!Token(p[3])||!uint.TryParse(p[4],NumberStyles.None,CultureInfo.InvariantCulture,out modifiers)||!uint.TryParse(p[5],NumberStyles.None,CultureInfo.InvariantCulture,out key)||!KeyAllowed(modifiers,key)||Slots.Count>=20||Slots.ContainsKey(p[3])||NextId>0xBFFF){Ack(id,"invalid");return;}
      foreach(Slot other in Slots.Values)if(other.Key==key&&other.Modifiers==modifiers){Ack(id,"occupied");return;}
      int armed=ArmState(modifiers,key);if(armed!=1){Ack(id,armed==0?"held":"unavailable");return;}
      var slot=new Slot { Id=NextId++,Token=p[3],Modifiers=modifiers,Key=key };
      if(!RegisterHotKey(IntPtr.Zero,slot.Id,modifiers|0x4000u,key)){Ack(id,Marshal.GetLastWin32Error()==1409?"occupied":"unavailable");return;}
      Slots.Add(slot.Token,slot);NativeIds.Add(slot.Id,slot);
      armed=ArmState(modifiers,key);if(armed!=1) {
        if(UnregisterHotKey(IntPtr.Zero,slot.Id)){Slots.Remove(slot.Token);NativeIds.Remove(slot.Id);Ack(id,armed==0?"held":"unavailable");}
        else Ack(id,"unavailable");
        return;
      }
      Ack(id,"ok");return;
    }
    if((p[2]=="query"||p[2]=="unregister")&&p.Length==4&&Token(p[3])) {
      Slot slot;if(!Slots.TryGetValue(p[3],out slot)){Ack(id,p[2]=="query"?"no":"ok");return;}
      if(p[2]=="query"){Ack(id,"ok");return;}
      slot.Active=false;
      if(!UnregisterHotKey(IntPtr.Zero,slot.Id)){Ack(id,"unavailable");return;}
      Slots.Remove(slot.Token);NativeIds.Remove(slot.Id);Ack(id,"ok");return;
    }
    if(p[2]=="activate"&&p.Length==5) {
      long next;string[] tokens=p[4].Length==0?new string[0]:p[4].Split(',');var selected=new HashSet<string>(tokens);
      if(!Number(p[3],out next)||next<=Generation||tokens.Length>20||selected.Count!=tokens.Length){Ack(id,"invalid");return;}
      foreach(string token in tokens)if(!Token(token)||!Slots.ContainsKey(token)){Ack(id,"invalid");return;}
      foreach(Slot slot in Slots.Values)slot.Active=false;
      // Source-queue cutover, not a claim about physical key release history.
      // No old native IDs are recycled; old pipe frames keep their old epoch.
      if(!DrainHotkeys()){Ack(id,"unavailable");Stop();return;}
      Generation=next;
      foreach(string token in tokens)Slots[token].Active=true;
      Ack(id,"ok");return;
    }
    if(p[2]=="stop"&&p.Length==3){Ack(id,"ok");Stop();return;}
    Ack(id,"invalid");
  }
  private static void ReadInput() {
    try {
      Stream input=Console.OpenStandardInput();var frame=new StringBuilder();int value;
      while(!Stopping&&(value=input.ReadByte())>=0) {
        if(value==10){if(!Commands.TryAdd(frame.ToString())||!PostThreadMessage(Owner,Wake,UIntPtr.Zero,IntPtr.Zero)){Stop();return;}frame.Length=0;}
        else {if(value!=9&&(value<32||value>126)||frame.Length>=4096){Stop();return;}frame.Append((char)value);}
      }
    } catch { /* EOF/broken pipe is a lifecycle stop, never an executable intent. */ }
    Stop();
  }
  private static void WriteOutput() {
    try {
      using(var output=new StreamWriter(Console.OpenStandardOutput(),new ASCIIEncoding(),1024)) {
        output.NewLine="\n";output.AutoFlush=true;
        foreach(string line in Output.GetConsumingEnumerable())output.WriteLine(line);
      }
    } catch { Stop(); }
  }
  public static int Main(string[] args) {
    uint parent;if(args.Length!=1||!uint.TryParse(args[0],NumberStyles.None,CultureInfo.InvariantCulture,out parent)||parent==0||parent==GetCurrentProcessId())return 2;
    IntPtr parentHandle=OpenProcess(0x00100000,false,parent);if(parentHandle==IntPtr.Zero)return 3;
    Owner=GetCurrentThreadId();Message message;PeekMessage(out message,IntPtr.Zero,0,0,0);
    new Thread(WriteOutput){IsBackground=true}.Start();
    new Thread(ReadInput){IsBackground=true}.Start();
    new Thread(delegate(){WaitForSingleObject(parentHandle,0xFFFFFFFF);CloseHandle(parentHandle);Stop();}){IsBackground=true}.Start();
    Emit("ready\t1\t"+Instance);
    try {
      while(!Stopping&&GetMessage(out message,IntPtr.Zero,0,0)>0) {
        if(message.Id==Wake) {
          string command;int budget=32;
          while(!Stopping&&budget-->0&&Commands.TryTake(out command))Command(command);
        } else if(message.Id==Hotkey) {
          Slot slot;ulong id=message.WParam.ToUInt64();
          if(id<=0xBFFF&&NativeIds.TryGetValue((int)id,out slot)&&slot.Active&&Generation>0) {
            if(Sequence>=9007199254740991L){Stop();break;}
            Emit("event\t"+Instance+"\t"+slot.Token+"\t"+Generation.ToString(CultureInfo.InvariantCulture)+"\t"+(++Sequence).ToString(CultureInfo.InvariantCulture));
          }
        }
      }
      return 0;
    } catch { return 4; }
    finally {
      Stopping=true;foreach(Slot slot in Slots.Values){slot.Active=false;UnregisterHotKey(IntPtr.Zero,slot.Id);}
    }
  }
}
