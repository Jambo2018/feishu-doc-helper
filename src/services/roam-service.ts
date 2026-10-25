import type { FeishuFile, FeishuFolder, TreeDataNode } from '../types/feishu';

/** Folder identity and ancestors determine exclusion, independent of names. */
export function getRoamCandidates(files: FeishuFile[], folders: FeishuFolder[], excluded: string[]): FeishuFile[] {
  const excludedSet = new Set(excluded);
  const parents = new Map(folders.map(folder => [folder.obj_token, folder.parentToken]));
  return files.filter(file => {
    if (!file.url || excludedSet.has(file.obj_token)) return false;
    const visited = new Set<string>();
    let parent = file.parentToken;
    while (parent && !visited.has(parent)) {
      if (excludedSet.has(parent)) return false;
      visited.add(parent);
      parent = parents.get(parent) || '';
    }
    return true;
  });
}

export function onlyFolders(nodes: TreeDataNode[]): TreeDataNode[] {
  return nodes.filter(node => node.type === 'folder').map(node => ({ ...node, children: onlyFolders(node.children || []) }));
}
