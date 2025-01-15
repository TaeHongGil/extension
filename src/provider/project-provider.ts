import * as fs from 'fs';
import * as path from 'path';
import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import DugConfig from '../config/dug-config';
import ExtensionUtil from '../utils/extension-util';

export class ProjectProvider implements TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: EventEmitter<TreeItem | undefined | void> = new EventEmitter<TreeItem | undefined | void>();
  readonly onDidChangeTreeData: Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!DugConfig.DUG.jvmHome || !DugConfig.DUG.gradleHome) return [];

    if (!element) {
      const workspaceFolder = DugConfig.workspacePath;
      if (!workspaceFolder) return [];
      const projects = await this.getProjects(workspaceFolder);
      return projects.map((directory) => this.createTreeItem(workspaceFolder, directory));
    } else {
      return [];
    }
  }

  private async getProjects(workspaceFolder: string): Promise<string[]> {
    try {
      const items = await fs.promises.readdir(workspaceFolder);
      return items.filter((item) => this.isValidProject(workspaceFolder, item));
    } catch (error) {
      ExtensionUtil.handleError('프로젝트 불러오기 에러:', error);
      return [];
    }
  }

  private isValidProject(workspaceFolder: string, item: string): boolean {
    try {
      const itemPath = path.join(workspaceFolder, item);
      const stats = fs.statSync(itemPath);
      return stats.isDirectory() && DugConfig.DUG.projectGroup.some((prefix) => item.startsWith(`${prefix}-`));
    } catch (error) {
      ExtensionUtil.handleError('프로젝트 불러오기 에러:', error);
      return false;
    }
  }

  private createTreeItem(workspaceFolder: string, directory: string): TreeItem {
    const treeItem = new TreeItem(directory, TreeItemCollapsibleState.None);
    treeItem.resourceUri = Uri.file(path.join(workspaceFolder, directory));
    treeItem.contextValue = /simulation-slot-\d+/g.test(directory) ? 'simulation' : 'directory';
    treeItem.iconPath = new ThemeIcon('file-directory');
    return treeItem;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
