import * as os from 'os';
import path from 'path';
import { commands, ExtensionContext, window } from 'vscode';
import DugConfig from '../config/dug-config';
import { Downloader } from '../utils/downloader';
import ExtensionUtil from '../utils/extension-util';
import { SettingWebview } from '../utils/webview';
import Zip from '../utils/zip';

export class DugUtils {
  static async resourceUpload(): Promise<void> {
    const resourceFolder = await ExtensionUtil.selectFolder();
    if (!resourceFolder) return;
    const version = await ExtensionUtil.getNumber('Version Number');
    if (!version) return;
    const slotNum = await ExtensionUtil.getNumber('Slot Number');
    if (!slotNum) return;

    const folderName = path.basename(resourceFolder.path);
    const directoryPath = path.dirname(resourceFolder.path);
    const zipPath = path.join(directoryPath, `${folderName}.zip`);
    const slotNumber: number = (Math.floor(+slotNum / 50) * 50) | 0;
    await Zip.zip(directoryPath, folderName);
    if (await this.validateResourceSize(zipPath)) return;
    const remoteDirectoryPath = `/vol/wcasino/html/mobile/download/s${slotNumber}/ver_${version}`;
    await this.uploadToSftp(remoteDirectoryPath, `${folderName}.zip`, zipPath, 'DUC');
  }

  private static async validateResourceSize(zipPath: string): Promise<boolean> {
    const uncomposedSize = await Zip.getZipSize(zipPath);
    if (uncomposedSize > 50000000) {
      ExtensionUtil.handleError('리소스 용량이 큽니다.');
      return true;
    }
    return false;
  }

  static async thumbnailUpload(): Promise<void> {
    const image = await ExtensionUtil.selectFile({
      'png (*.png)': ['png'],
    });
    if (!image) return;
    const slotNumber = await ExtensionUtil.getNumber('Slot Number');
    if (!slotNumber) return;
    const remote = await ExtensionUtil.quickPick('Type', [
      { label: 'Thumbnail', fileName: `${slotNumber}.png`, path: '/vol/wcasino/html/mobile/download/slot_thumbnail' },
      { label: 'Long Banner', fileName: `long_banner_${slotNumber}.png`, path: '/vol/wcasino/html/mobile/images/long' },
    ]);
    if (!remote) return;

    await this.uploadToSftp(remote.path, remote.fileName, image.fsPath, 'DUC');
  }

  private static async uploadToSftp(remoteDirectoryPath: string, remoteFileName: string, localPath: string, server: string) {
    const sftp = await DugConfig.selectSftp(server);
    if (!sftp) return;
    await sftp.connect();
    await sftp.upload(remoteDirectoryPath, remoteFileName, localPath);
    commands.executeCommand('dugExplorer.sftp.bookmark.expand', server, path.posix.join(remoteDirectoryPath, remoteFileName));
  }

  static async crashCheck(context: ExtensionContext): Promise<void> {
    if (!DugConfig.DUG.ndkHome) {
      ExtensionUtil.handleError('NDK가 존재하지 않습니다. 설정을 확인해주세요.');
      return;
    }
    const soFile = await ExtensionUtil.selectFile();
    if (!soFile) return;
    const errorCode = await ExtensionUtil.getString('Error Code');
    if (!errorCode) return;

    this.runCrashCheck(context, soFile.fsPath, errorCode);
  }

  private static runCrashCheck(context: ExtensionContext, soFilePath: string, errorCode: string) {
    const terminal = window.createTerminal({ name: 'Crash Check', hideFromUser: false });
    terminal.show();
    terminal.sendText(`bash ${context.extensionPath}/script/crash-check.sh ${DugConfig.DUG.ndkHome} ${soFilePath} ${errorCode}`);
  }

  static async dugSetting(): Promise<void> {
    try {
      await this.downloadRequiredFiles();
      await this.unzipRequiredFiles();
      await this.updateDugConfiguration();
      window.showInformationMessage('Default Setting 완료되었습니다.');
    } catch (error: any) {
      ExtensionUtil.handleError(`설정 중 오류가 발생했습니다`, error);
    }
  }

  // FIXME 다운로드 경로 설정
  private static async downloadRequiredFiles() {
    await Promise.all([
      Downloader.download('', DugConfig.dugSettingPath, 'tomcat-8.5.zip'),
      Downloader.download('', DugConfig.dugSettingPath, 'jdk-8.zip'),
      Downloader.download('', DugConfig.dugSettingPath, 'gradle-2.14.1.zip'),
      Downloader.download('', path.join(DugConfig.userHomePath, '.m2', 'repository'), 'archetype-catalog.xml'),
    ]);
  }

  private static async unzipRequiredFiles() {
    await Promise.all([
      Zip.unzip(path.join(DugConfig.dugSettingPath, 'tomcat-8.5.zip'), 'tomcat-8.5'),
      Zip.unzip(path.join(DugConfig.dugSettingPath, 'jdk-8.zip'), 'jdk-8'),
      Zip.unzip(path.join(DugConfig.dugSettingPath, 'gradle-2.14.1.zip'), 'gradle-2.14.1'),
    ]);
  }

  // FIXME HOST 경로 설정
  private static async updateDugConfiguration() {
    const tomcat = DugConfig.DUG.tomcatInstances.find((info) => info.name == 'DUG');
    if (!tomcat) {
      await DugConfig.addTomcat({ name: 'DUG', catalinaHome: path.join(DugConfig.dugSettingPath, 'tomcat-8.5') });
    }
    const sftp = DugConfig.DUG.sftpInstances.find((info) => info.name == 'DUC');
    if (!sftp) {
      await DugConfig.addSftp({
        name: 'DUC',
        host: '',
        user: 'ec2-user',
      });
    }
    await DugConfig.updateConfiguration('DUG', 'gradleHome', path.join(DugConfig.dugSettingPath, 'gradle-2.14.1'));
    await DugConfig.updateConfiguration('DUG', 'jvmHome', path.join(DugConfig.dugSettingPath, 'jdk-8', 'Contents', 'Home'));
    await DugConfig.updateConfiguration('C_Cpp', 'clang_format_style', '{ BasedOnStyle: Google, IndentWidth: 4, ColumnLimit: 0, BreakBeforeBraces: Stroustrup}');
    await DugConfig.updateConfiguration('java', 'format.settings.url', 'https://raw.githubusercontent.com/TaeHongGil/java_formatter/main/Untitled.xml');
  }

  // FIXME 다운로드 경로 설정
  static async crashSetting(): Promise<void> {
    try {
      await Downloader.download('', path.join(os.homedir(), 'dugSetting'), 'crash.zip');
      await Zip.unzip(path.join(DugConfig.dugSettingPath, 'crash.zip'), 'crash');
      await DugConfig.updateConfiguration('DUG', 'ndkHome', path.join(DugConfig.dugSettingPath, 'crash', 'AndroidNDK7779620'));
      window.showInformationMessage('Crash Setting 완료되었습니다.');
    } catch (error: any) {
      ExtensionUtil.handleError(`설정 중 오류가 발생했습니다:`, error);
    }
  }

  static async refreshExplor() {
    DugConfig.configInit();
    await SettingWebview.loadSettings();
    await commands.executeCommand('dugExplorer.refresh');
  }
}

export default DugUtils;
