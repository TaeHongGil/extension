import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import DugConfig, { TomcatInfo } from '../config/dug-config';

export class TomcatProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | void> = new EventEmitter<TreeItem | undefined | void>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!DugConfig.DUG.jvmHome || !DugConfig.DUG.gradleHome) return;
    if (!element) {
      return DugConfig.DUG.tomcatInstances.map((instance) => this.createTreeItem(instance));
    }
    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async run(target: TreeItem): Promise<void> {
    const tomcat = await this.getTomcat(target);
    if (tomcat) {
      await tomcat.tomcatRun();
    }
  }

  async stop(target: TreeItem): Promise<void> {
    const tomcat = await this.getTomcat(target);
    if (tomcat) {
      await tomcat.stopTomcat();
    }
  }

  async openServerXml(target: TreeItem): Promise<void> {
    const tomcat = await this.getTomcat(target);
    if (tomcat) {
      await tomcat.openServerXml();
    }
  }

  async openServerLog(target: TreeItem): Promise<void> {
    const tomcat = await this.getTomcat(target);
    if (tomcat) {
      await tomcat.openLogFile();
    }
  }

  async openCatalinaHome(target: TreeItem): Promise<void> {
    const tomcat = await this.getTomcat(target);
    if (tomcat) {
      await tomcat.openCatalinaHome();
    }
  }

  private async getTomcat(target: TreeItem) {
    return await DugConfig.selectTomcat(target.label as string);
  }

  createTreeItem(tomcatInfo: TomcatInfo): TreeItem {
    const treeItem = new TreeItem(tomcatInfo.name, TreeItemCollapsibleState.None);
    treeItem.resourceUri = Uri.file(tomcatInfo.catalinaHome);
    treeItem.iconPath = new ThemeIcon('server-environment');
    return treeItem;
  }
}
