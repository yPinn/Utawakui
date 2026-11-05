// Sidebar tree of user playlists. `playlists` arrive in saved order, which
// Main keeps equal to the flattened sidebar order; `layout.order` places
// folders among loose playlists. Unplaced entries append, never vanish.
export function buildPlaylistTree(playlists, layout) {
  const folders = new Map(
    (layout?.folders ?? []).map((folder) => [
      folder.id,
      { kind: 'folder', folder, children: [] },
    ]),
  );
  for (const playlist of playlists) {
    folders.get(playlist.folderId)?.children.push(playlist);
  }
  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const nodes = [];
  const placed = new Set();
  const isLoose = (playlist) => !folders.has(playlist.folderId);
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

// One flat row list for the template: folder rows, their members while
// expanded, and an empty-folder drop hint.
export function playlistTreeRows(nodes, isExpanded) {
  return nodes.flatMap((node) => {
    if (node.kind === 'playlist') {
      return [
        {
          kind: 'playlist',
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
        id: playlist.id,
        playlist,
        folderId: node.folder.id,
      });
    }
    if (node.children.length === 0) {
      rows.push({ kind: 'empty', id: node.folder.id, folder: node.folder });
    }
    return rows;
  });
}

// Drop zones: folder rows take 'inside' in the middle (and at the bottom
// while expanded, where the members follow); folders never nest.
export function playlistDropPosition(row, ratio, { draggingFolder }) {
  if (row.kind === 'empty') return draggingFolder ? null : 'inside';
  if (row.kind === 'folder') {
    if (draggingFolder) return ratio < 0.5 ? 'before' : 'after';
    if (ratio < 0.3) return 'before';
    if (!row.expanded && ratio > 0.7) return 'after';
    return 'inside';
  }
  if (draggingFolder && row.folderId) return null;
  return ratio < 0.5 ? 'before' : 'after';
}
