import path from 'path';
import { commands, ExtensionContext, TreeItem, TreeView, window } from 'vscode';
import DugConfig from './config/dug-config';
import DugUtils from './extension/dug-util';
import { ProjectProvider } from './provider/project-provider';
import { SftpProvider, SftpTreeItem } from './provider/sftp-provider';
import { TomcatProvider } from './provider/tomcat-provider';
import ExtensionUtil from './utils/extension-util';
import Gradle from './utils/gradle';
import Maven from './utils/maven';
import { SettingWebview } from './utils/webview';

let directoryProvider: ProjectProvider;
let tomcatProvider: TomcatProvider;
let sftpProvider: SftpProvider;
let sftpTreeView: TreeView<SftpTreeItem>;

export async function activate(context: ExtensionContext): Promise<void> {
  globalThis.DugConfig = DugConfig;
  DugConfig.extensionInit(context);
  DugConfig.configInit();

  directoryProvider = new ProjectProvider();
  tomcatProvider = new TomcatProvider();
  sftpProvider = new SftpProvider();

  registerSftpCommands(context);

  registerTomcatCommands(context);

  registerProjectCommands(context);

  registerOtherCommands(context);

  commands.executeCommand('dugExplorer.refresh');
}

export async function deactivate(): Promise<void> {
  for (const instance of DugConfig.activatedTomcat) {
    await instance.stopTomcat();
    instance.disposeOutputChannel();
  }
  for (const instance of DugConfig.activatedSftp) {
    await instance.disconnect();
  }
}

function registerSftpCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('dugExplorer.sftp.refresh', () => sftpProvider.refresh()),
    commands.registerCommand('dugExplorer.sftp.connect', async (server: SftpTreeItem) => {
      const sftp = DugConfig.activatedSftp.find((sftp) => sftp.name == server.label);
      if (sftp) {
        await sftp.connect();
        sftpProvider.refresh();
      }
    }),
    commands.registerCommand('dugExplorer.sftp.disconnect', async (server: SftpTreeItem) => {
      const sftp = DugConfig.activatedSftp.find((sftp) => sftp.name == server.label);
      if (sftp) {
        await sftp.disconnect();
        sftpProvider.refresh();
      }
    }),
    commands.registerCommand('dugExplorer.sftp.mkdir', async (item: SftpTreeItem) => {
      await item.sftp.mkdir(item.resourceUri.fsPath, item.contextValue === 'directory');
    }),
    commands.registerCommand('dugExplorer.sftp.add', () => DugConfig.addSftp()),
    commands.registerCommand('dugExplorer.sftp.download', async (item: SftpTreeItem) => {
      await item.sftp.download(item.resourceUri.fsPath, item.contextValue === 'directory');
    }),
    commands.registerCommand('dugExplorer.sftp.upload', async (item: SftpTreeItem) => {
      const localPath = (await ExtensionUtil.selectAnything())?.fsPath;
      if (!localPath) return;
      await item.sftp.upload(item.resourceUri.fsPath, path.basename(localPath), localPath);
    }),
    commands.registerCommand('dugExplorer.sftp.delete', async (item: SftpTreeItem) => {
      await item.sftp.delete(item.resourceUri.fsPath);
    }),
    commands.registerCommand('dugExplorer.sftp.preview', async (item: SftpTreeItem) => {
      item.sftp.preview(item.resourceUri.fsPath);
    }),
    commands.registerCommand('dugExplorer.sftp.bookmark.add', async (item: SftpTreeItem) => {
      DugConfig.addBookmark({ server: item.sftp.name, path: item.resourceUri.fsPath });
    }),
    commands.registerCommand('dugExplorer.sftp.bookmark.expand', async (server: string, path: string) => {
      const bookmark = server && path ? { server, path } : await DugConfig.selectBookmark();
      if (!bookmark) return;
      const sftp = await DugConfig.selectSftp(bookmark.server);
      if (!sftp) return;
      await sftp.connect();
      await sftpProvider.expandToPath(bookmark, sftpTreeView);
    }),
  );
}

function registerTomcatCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('dugExplorer.tomcat.refresh', () => tomcatProvider.refresh()),
    commands.registerCommand('dugExplorer.tomcat.add', () => DugConfig.addTomcat()),
    commands.registerCommand('dugExplorer.tomcat.run', async (target: TreeItem) => tomcatProvider.run(target)),
    commands.registerCommand('dugExplorer.tomcat.stop', async (target: TreeItem) => tomcatProvider.stop(target)),
    commands.registerCommand('dugExplorer.tomcat.open.serverxml', async (target: TreeItem) => tomcatProvider.openServerXml(target)),
    commands.registerCommand('dugExplorer.tomcat.open.log', async (target: TreeItem) => tomcatProvider.openServerLog(target)),
    commands.registerCommand('dugExplorer.tomcat.open.home', async (target: TreeItem) => tomcatProvider.openCatalinaHome(target)),
  );
}

function registerProjectCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('dugExplorer.project.refresh', () => directoryProvider.refresh()),
    commands.registerCommand('dugExplorer.gradle.task.publish', async (directory: TreeItem) => Gradle.gradleTask(context, directory, true)),
    commands.registerCommand('dugExplorer.gradle.task', async (directory: TreeItem) => Gradle.gradleTask(context, directory)),
    commands.registerCommand('dugExplorer.maven.update', async (directory: TreeItem) => Maven.update(directory)),
    commands.registerCommand('dugExplorer.maven.webpack', async (directory: TreeItem) => Maven.webpack(directory)),
    commands.registerCommand('dugExplorer.maven.deploy', (directory: TreeItem) => Maven.deploy(directory)),
    commands.registerCommand('dugExplorer.maven.install', (directory: TreeItem) => Maven.install(directory)),
    commands.registerCommand('dugExplorer.maven.eclipse', (directory: TreeItem) => Maven.eclipse(directory)),
  );
}

function registerOtherCommands(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('dug.crash.check', async () => DugUtils.crashCheck(context)),
    commands.registerCommand('dug.dug.setting', async () => SettingWebview.showSettingsWebview(context)),
    commands.registerCommand('dug.crash.setting', async () => DugUtils.crashSetting()),
    commands.registerCommand('dugExplorer.maven.create.slot.simulation', async () => Maven.createSimul()),
    commands.registerCommand('dugExplorer.maven.create.slot.ui', async () => Maven.createUi()),
    commands.registerCommand('dugExplorer.maven.create.meta.ui', async () => Maven.createMetaUi()),
    commands.registerCommand('dugExplorer.duc.slot.resource.upload', async () => DugUtils.resourceUpload()),
    commands.registerCommand('dugExplorer.duc.slot.thumbnail.upload', async () => DugUtils.thumbnailUpload()),
    commands.registerCommand('dugExplorer.duc.slot.simulation.update', async (directory: TreeItem) => Maven.localSimulationUpdate(directory)),
    commands.registerCommand('dugExplorer.refresh', async () => {
      window.registerTreeDataProvider('dug.project', directoryProvider);
      window.registerTreeDataProvider('tomcat.instances', tomcatProvider);
      sftpTreeView = window.createTreeView('sftp.directory', { treeDataProvider: sftpProvider });
    }),
  );
}
