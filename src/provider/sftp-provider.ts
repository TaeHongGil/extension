import * as path from 'path';
import naturalCompare from 'string-natural-compare';
import { commands, Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, Uri } from 'vscode';
import DugConfig, { SftpBookmark, SftpInfo } from '../config/dug-config';
import ExtensionUtil from '../utils/extension-util';
import { FileInfo, Sftp } from '../utils/sftp';

export class SftpTreeItem extends TreeItem {
  label: string;
  sftp?: Sftp;
  parent?: SftpTreeItem;

  constructor(label: string, collapsibleState: TreeItemCollapsibleState, sftp?: Sftp) {
    super(label, collapsibleState);
    this.sftp = sftp;
  }
}

export class SftpProvider implements TreeDataProvider<SftpTreeItem> {
  remoteNoneIconPath: { dark: Uri; light: Uri };
  remoteConnectedIconPath: { dark: Uri; light: Uri };

  constructor() {
    this.remoteNoneIconPath = {
      dark: Uri.file(path.join(DugConfig.extensionPath, 'resources', 'dark', 'remote_none.svg')),
      light: Uri.file(path.join(DugConfig.extensionPath, 'resources', 'light', 'remote_none.svg')),
    };
    this.remoteConnectedIconPath = {
      dark: Uri.file(path.join(DugConfig.extensionPath, 'resources', 'dark', 'remote_connected.svg')),
      light: Uri.file(path.join(DugConfig.extensionPath, 'resources', 'light', 'remote_connected.svg')),
    };
  }

  private _onDidChangeTreeData: EventEmitter<SftpTreeItem | undefined | void> = new EventEmitter<SftpTreeItem | undefined | void>();
  readonly onDidChangeTreeData: Event<SftpTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  async getParent(element: SftpTreeItem): Promise<SftpTreeItem> {
    return element.parent;
  }

  async getTreeItem(element: SftpTreeItem): Promise<SftpTreeItem> {
    return element;
  }

  async getChildren(element?: SftpTreeItem): Promise<SftpTreeItem[]> {
    if (!DugConfig.DUG.privateKeyPath) return [];
    try {
      if (!element) {
        const instances = DugConfig.DUG.sftpInstances;
        const serverTreeItems = await Promise.all(instances.map((instance) => this.createServerTreeItem(instance)));
        return serverTreeItems;
      } else if (element.contextValue === 'server' && element.sftp) {
        return await this.listDirectoryItems(element, '/');
      } else if (element.resourceUri && element.sftp) {
        return await this.listDirectoryItems(element, element.resourceUri.fsPath);
      }
    } catch (error: any) {
      ExtensionUtil.handleError('SFTP 디렉터리 생성 에러', error);
      return [];
    }
  }

  async createServerTreeItem(server: SftpInfo): Promise<SftpTreeItem> {
    const sftp = await DugConfig.selectSftp(server.name);
    const collapsibleState = sftp.isConnected ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
    const treeItem = new SftpTreeItem(server.name, collapsibleState, sftp);
    treeItem.iconPath = this.getServerIconPath(collapsibleState);
    treeItem.contextValue = 'server';
    return treeItem;
  }

  private async listDirectoryItems(element: SftpTreeItem, directoryPath: string): Promise<SftpTreeItem[]> {
    try {
      const items = await element.sftp.list(directoryPath);
      return items.map((item) => this.createTreeItem(element, element.sftp, item)).sort((a, b) => naturalCompare(a.label, b.label));
    } catch (error: any) {
      ExtensionUtil.handleError('SFTP 디렉터리 생성 에러', error);
      return [];
    }
  }

  private getServerIconPath(collapsibleState: TreeItemCollapsibleState) {
    return collapsibleState === TreeItemCollapsibleState.None
      ? { dark: this.remoteNoneIconPath.dark, light: this.remoteNoneIconPath.light }
      : { dark: this.remoteConnectedIconPath.dark, light: this.remoteConnectedIconPath.light };
  }

  createTreeItem(element: SftpTreeItem, sftp: Sftp, item: FileInfo): SftpTreeItem {
    const label = path.basename(item.path);
    const collapsibleState = item.isDirectory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
    const treeItem = new SftpTreeItem(label, collapsibleState, sftp);
    treeItem.contextValue = item.isDirectory ? 'directory' : 'file';
    treeItem.iconPath = item.isDirectory ? new ThemeIcon('folder') : new ThemeIcon('file');
    treeItem.resourceUri = Uri.file(item.path);
    treeItem.parent = element;
    return treeItem;
  }

  async expandToPath(bookmark: SftpBookmark, treeView: TreeView<SftpTreeItem>): Promise<void> {
    await commands.executeCommand('workbench.actions.treeView.sftp.directory.collapseAll');
    this.refresh();

    const server = (await this.getChildren()).find((item) => item.label === bookmark.server);
    if (!server) {
      ExtensionUtil.handleError(`서버를 찾을 수 없습니다: ${bookmark.server}`);
      return;
    }
    let currentItems: SftpTreeItem[] = await this.getChildren(server);
    const segments = bookmark.path.split(path.sep).filter((segment) => segment);

    let matchingItem: SftpTreeItem;
    for (const segment of segments) {
      matchingItem = currentItems.find((item) => item.label === segment);
      if (matchingItem) {
        if (matchingItem.contextValue !== 'file') {
          currentItems = await this.getChildren(matchingItem);
        }
        matchingItem.collapsibleState = TreeItemCollapsibleState.Expanded;
      } else {
        ExtensionUtil.handleError(`경로를 탐색할 수 없습니다: ${segment}`);
        break;
      }
    }
    if (matchingItem) {
      await treeView.reveal(matchingItem, { select: true, focus: true, expand: true });
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
