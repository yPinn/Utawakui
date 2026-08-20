# ADR 0002: Keep the packaged exe named `electron.exe`, not `Utawakui.exe`

## Status

Accepted (2026-08-20).

## Context

A packaged Windows build (`npm run dist`/`dist:dir`) that ships with its executable renamed to the branded `Utawakui.exe` (electron-builder's default behavior — `productFilename` derived from `productName` when `executableName` isn't set) FATALs immediately on at least one dev machine, before any window appears:

```text
FATAL: GPU process isn't usable. Goodbye.
Exception code: 0x80000003
```

The same build, with the on-disk exe kept literally named `electron.exe` (via `win.executableName: electron` in `electron-builder.yml`), launches fine. Renaming a byte-identical copy of the working `electron.exe` reproduces the crash; renaming it back fixes it. This was investigated in depth rather than assumed to be a one-off, because it blocks shipping the app under its real name.

## Investigation

Ruled out, with direct evidence rather than by elimination alone:

- **Stale/corrupted build artifact** — a from-scratch clean rebuild (`rm -rf release/`, fresh `dist:dir`) reproduces the identical crash on the renamed output. Not a caching or partial-build issue.
- **DACL / folder permissions** — `icacls`/`Get-Acl` on the working `electron.exe` and a plain `Rename-Item` copy of the exact same file (same folder, same inherited DACL, same content, same rcedit-stamped version resource) show identical permissions; only the renamed copy crashes. Confirms the file's own bytes/ACL aren't the variable — only the on-disk name is.
- **Windows Defender** — `Get-MpThreatDetection`/`Get-MpThreat` show zero detections; Controlled Folder Access and ASR rules are both off.
- **Riot Vanguard (`vgk`)** — installed and running on this machine (a real, plausible suspect: kernel-level anti-cheat drivers are known to interfere with processes that create sandboxed/restricted GPU tokens). Directly tested: stopped `vgk`/`vgc` and rebuilt+relaunched the renamed exe — crash reproduced identically. Ruled out by direct experiment, not inference.
- **Windows Smart App Control** and **WDAC/Code Integrity policy** — both confirmed off/unconfigured on this machine.
- **A comparable sibling app** (`elitesand-pro`, same machine, same Electron/electron-builder major versions, unsigned, custom-named `Elitesand Pro.exe`, real end-user installs, never renamed) launches fine. This disproves any theory of the form "any non-`electron.exe` name is blocked" — the trigger has to be something `Utawakui` bundles that `elitesand-pro` doesn't.

**Isolated the actual trigger** via controlled A/B rebuilds: excluding `onnxruntime-node` (the DirectML-backed vocal-separation dependency) from packaging makes the renamed exe launch successfully. Re-including it reproduces the crash. This holds regardless of _when_ the module is required — moving `require('onnxruntime-node')` in `electron/lib/vocalSeparation.js` from eager (module load time, pulled in transitively by `main.js`) to lazy (inside the functions that actually run inference, which only execute inside `vocalSeparationWorker.js`'s worker thread) made no difference. The trigger is the bundled files' presence in the package, not when/whether the app's own JS touches them.

**Process Monitor** (Sysinternals procmon, elevated, filtered to the renamed exe's `--type=gpu-process` child) captured the crash directly: every single file/registry operation that child process made — including fully reading and memory-mapping `icudtl.dat` — returned `SUCCESS`. Its last actions were closing `icudtl.dat` and its Mojo IPC pipe back to the parent process cleanly, then `Process Exit`. Nothing was denied or blocked. This is Chromium's own internal `CHECK()`/`ImmediateCrash()` firing on some invariant, not an OS- or security-software-level interception — directly observed, not inferred from the absence of AV logs.

**`app.commandLine.appendSwitch('in-process-gpu')`** (routing GPU work into the browser process instead of a separate child) does avoid the GPU-process crash specifically — but the identical failure then reappears in the **network service** child process instead, as an infinite crash/respawn loop (`Network service crashed or was terminated, restarting service.`, repeating continuously) rather than a clean FATAL. Confirmed via `--enable-logging=file`. The renamed exe never shows a window because Chromium never finishes an initial page load with a dead network service, so `ready-to-show` never fires. Tested the same build renamed back to `electron.exe`: zero network-service crash lines, real window, correct title. So the failure isn't GPU-process-specific — it's _any_ Chromium child process this exact renamed+onnxruntime-bundled binary re-execs itself as.

## Decision

Keep `win.executableName: electron` in `electron-builder.yml`. The on-disk packaged exe stays named `electron.exe` regardless of branding.

This does not affect user-facing identity: the Start Menu shortcut label comes from `productName` (`CommonWindowsInstallerConfiguration`'s `shortcutName` default), its AUMID is stamped from `appId` by the NSIS template independent of the target exe's filename, and `userData` resolves from `app.setName('Utawakui')` in `electron/main.js`, not from `process.execPath`. `build/installer.nsh` also overrides NSIS `APP_FILENAME` back to `Utawakui`, so the assisted installer defaults to `%LOCALAPPDATA%\Programs\Utawakui` while `APP_EXECUTABLE_FILENAME` remains `electron.exe`. The remaining visible side effect is Task Manager's process-name column showing `electron.exe` (its `FileDescription` still reads "Utawakui").

## Consequences

A real fix requires symbolized crash-dump analysis (WinDbg + Electron's own PDB symbols) to identify which specific Chromium `CHECK()` is failing and why it's sensitive to the host process's own image name when DirectML is loaded — not another command-line flag. That work is not scoped for now.

If this comes up again — "why is the exe still called electron.exe" — the answer is: extensively verified as the only complete mitigation found; every alternative tried (permissions, anti-cheat, Windows app-reputation features, lazy-loading the dependency, folding GPU work in-process) either did nothing or only moved the same crash to a different Chromium child process. Revisit this workaround if `onnxruntime-node`/DirectML is ever dropped as a dependency (the crash is confirmed absent without it), or once a symbolized root cause points at an actual fix instead of a process-topology workaround.
