import fs from 'fs';
import path from 'path';
import { env, ExtensionContext, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import DugConfig from '../config/dug-config';
import DugUtils from '../extension/dug-util';
import ExtensionUtil from './extension-util';

export class SettingWebview {
  static currentPanel: WebviewPanel;

  static async sendMessageToWebview(command: string, data: any = {}): Promise<void> {
    await SettingWebview.currentPanel?.webview.postMessage({ command, data });
  }

  static async loadSettings() {
    await SettingWebview.sendMessageToWebview('loadSettings', DugConfig.DUG);
  }

  static async showSettingsWebview(context: ExtensionContext): Promise<void> {
    const columnToShowIn = window.activeTextEditor ? window.activeTextEditor.viewColumn : undefined;

    if (!SettingWebview.currentPanel) {
      SettingWebview.currentPanel = window.createWebviewPanel('dugSettings', 'DUG 설정', ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });

      const htmlFilePath = path.join(context.extensionPath, 'webview', 'setting.html');
      const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
      SettingWebview.currentPanel.webview.html = htmlContent;

      SettingWebview.currentPanel.onDidDispose(
        () => {
          SettingWebview.currentPanel = undefined;
        },
        null,
        context.subscriptions,
      );

      SettingWebview.currentPanel.webview.onDidReceiveMessage(
        async (message: any) => {
          try {
            switch (message.command) {
              case 'init': {
                await SettingWebview.loadSettings();
                break;
              }
              case 'openConfluence': {
                env.openExternal(Uri.parse('https://studio-g.atlassian.net/wiki/spaces/slotduc/pages/1408008642'));
                break;
              }
              case 'setDefaultSettings': {
                await DugUtils.dugSetting();
                await DugUtils.refreshExplor();
                break;
              }
              case 'saveSettings': {
                const { jvmHome, gradleHome, projectGroup, privateKeyPath } = message.data;
                if (DugConfig.settingValidate(message.data)) {
                  await DugConfig.updateConfiguration('DUG', 'jvmHome', jvmHome);
                  await DugConfig.updateConfiguration('DUG', 'gradleHome', gradleHome);
                  await DugConfig.updateConfiguration('DUG', 'projectGroup', projectGroup);
                  await DugConfig.updateConfiguration('DUG', 'privateKeyPath', privateKeyPath);
                  window.showInformationMessage('Setting 저장 성공');
                  await DugUtils.refreshExplor();
                }
                break;
              }
              case 'deleteTomcat': {
                const { name } = message.data;
                if (await ExtensionUtil.confirmModal(`${name} 삭제하시겠습니까?`)) {
                  DugConfig.DUG.tomcatInstances = DugConfig.DUG.tomcatInstances.filter((instance: any) => instance.name !== name);
                  await DugConfig.updateConfiguration('DUG', 'tomcatInstances', DugConfig.DUG.tomcatInstances);
                  await SettingWebview.sendMessageToWebview('updateTomcatList', DugConfig.DUG.tomcatInstances);
                }
                await DugUtils.refreshExplor();
                break;
              }
              case 'deleteSftp': {
                const { name } = message.data;
                if (await ExtensionUtil.confirmModal(`${name} 삭제하시겠습니까?`)) {
                  DugConfig.DUG.sftpInstances = DugConfig.DUG.sftpInstances.filter((instance: any) => instance.name !== name);
                  await DugConfig.updateConfiguration('DUG', 'sftpInstances', DugConfig.DUG.sftpInstances);
                  await SettingWebview.sendMessageToWebview('updateSftpList', DugConfig.DUG.sftpInstances);
                }
                await DugUtils.refreshExplor();
                break;
              }
              case 'getPath': {
                const id = message.data.id;
                const type = message.data.type;
                const path = type == 'file' ? await ExtensionUtil.selectFile() : await ExtensionUtil.selectFolder();
                if (columnToShowIn) {
                  SettingWebview.currentPanel.reveal(columnToShowIn);
                }
                if (!path) return;
                await SettingWebview.sendMessageToWebview('import', { id, path: path.fsPath });
                break;
              }
            }
          } catch (error: any) {
            ExtensionUtil.handleError('Webview', error);
          }
        },
        undefined,
        context.subscriptions,
      );
    } else {
      SettingWebview.currentPanel.reveal(columnToShowIn);
    }
  }
}
