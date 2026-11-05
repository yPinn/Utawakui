// Sidebar index tree. Each folder lists its user playlists in order;
// `layout.order` places folders among loose playlists, and unplaced
// playlists append in saved order, never vanish. Albums stay below.
export function buildPlaylistTree(playlists, layout) {
  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const inFolder = new Set();
  const folders = new Map(
    (layout?.folders ?? []).map((folder) => {
      const children = (folder.items ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean);
      for (const child of children) inFolder.add(child.id);
      return [folder.id, { kind: 'folder', folder, children }];
    }),
  );
  const nodes = [];
  const placed = new Set();
  const isLoose = (playlist) =>
    playlist.kind !== 'album' && !inFolder.has(playlist.id);
  for (const id of layout?.order ?? []) {
    if (placed.has(id)) continue;
    const playlist = byId.get(id);
    if (folders.has(id)) nodes.push(folders.get(id));
    else if (playlist && isLoose(playlist))
      nodes.push({ kind: 'playlist', playlist });
    else continue;
    placed.add(id);
  }
  for (const playlist of playlists) {
    if (isLoose(playlist) && !placed.has(playlist.id))
      nodes.push({ kind: 'playlist', playlist });
  }
  for (const [id, node] of folders) {
    if (!placed.has(id)) nodes.push(node);
  }
  return nodes;
}

// A folder whose name matches keeps all members; otherwise it shows only
// matching members and drops out when none match.
export function filterPlaylistTree(nodes, playlistMatches, folderMatches) {
  return nodes.flatMap((node) => {
    if (node.kind === 'playlist') {
      return playlistMatches(node.playlist) ? [node] : [];
    }
    if (folderMatches(node.folder)) return [node];
    const children = node.children.filter(playlistMatches);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

// One flat row list for the template: folder rows and, while expanded,
// their members.
export function playlistTreeRows(nodes, isExpanded) {
  return nodes.flatMap((node) => {
    if (node.kind === 'playlist') {
      return [
        {
          kind: 'playlist',
          key: `top:${node.playlist.id}`,
          id: node.playlist.id,
          playlist: node.playlist,
          folderId: null,
        },
      ];
    }
    const expanded = isExpanded(node.folder);
    const rows = [
      {
        kind: 'folder',
        key: `folder:${node.folder.id}`,
        id: node.folder.id,
        folder: node.folder,
        count: node.children.length,
        expanded,
      },
    ];
    if (!expanded) return rows;
    for (const playlist of node.children) {
      rows.push({
        kind: 'playlist',
        key: `${node.folder.id}:${playlist.id}`,
        id: playlist.id,
        playlist,
        folderId: node.folder.id,
      });
    }
    return rows;
  });
}

// Row edges reorder; the middle adds: into a folder ('inside') or the
// dragged tracks into a playlist ('add'). Expanded folders take 'inside' at
// the bottom too, where their members follow. Folders never nest. An album
// stays in the library tier: dropped into a folder it becomes a new
// playlist there, so it only lands inside folders or adds tracks.
export function playlistDropPosition(
  row,
  ratio,
  { draggingFolder = false, draggingAlbum = false } = {},
) {
  if (row.kind === 'folder') {
    if (draggingFolder) return ratio < 0.5 ? 'before' : 'after';
    if (draggingAlbum) return 'inside';
    if (ratio < 0.25) return 'before';
    if (!row.expanded && ratio > 0.75) return 'after';
    return 'inside';
  }
  if (draggingFolder) {
    if (row.folderId) return null;
    return ratio < 0.5 ? 'before' : 'after';
  }
  const edge = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : null;
  if (edge) return draggingAlbum && !row.folderId ? null : edge;
  return row.playlist?.kind === 'playlist' ? 'add' : null;
}
