import { spawn } from 'child_process';
import fs from 'fs';
import * as os from 'os';
import path from 'path';
import { commands, ExtensionContext, window, workspace, WorkspaceConfiguration } from 'vscode';
import ExtensionUtil from '../utils/extension-util';
import { Sftp } from '../utils/sftp';
import { Tomcat } from '../utils/tomcat/tomcat';

export interface SftpInfo {
  name: string;
  host: string;
  user: string;
  port: number;
}

export interface SftpBookmark {
  server: string;
  path: string;
}

export interface TomcatInfo {
  name: string;
  catalinaHome: string;
}

export class DugConfig {
  static workspacePath: string;
  static extensionPath: string;
  static userHomePath: string;
  static dugSettingPath: string;
  static activatedTomcat: Tomcat[] = [];
  static activatedSftp: Sftp[] = [];
  static DUG: {
    config: WorkspaceConfiguration;
    jvmHome: string;
    gradleHome: string;
    tomcatInstances: TomcatInfo[];
    sftpInstances: SftpInfo[];
    sftpBookmarks: SftpBookmark[];
    projectGroup: string[];
    ndkHome: string;
    privateKeyPath: string;
  };

  static DUC: {
    simulationVersion: string;
  };

  static extensionInit(context: ExtensionContext): void {
    DugConfig.workspacePath = workspace.workspaceFolders ? workspace.workspaceFolders[0].uri.fsPath : undefined;
    DugConfig.userHomePath = os.homedir();
    DugConfig.dugSettingPath = path.join(DugConfig.userHomePath, 'dugSetting');
    DugConfig.extensionPath = context.extensionPath;
  }

  static configInit(): void {
    const config = workspace.getConfiguration('DUG');
    DugConfig.DUG = {
      config: config,
      jvmHome: config.get('jvmHome', ''),
      gradleHome: config.get('gradleHome', ''),
      tomcatInstances: config.get<TomcatInfo[]>('tomcatInstances') || [],
      sftpInstances: config.get<SftpInfo[]>('sftpInstances') || [],
      sftpBookmarks: config.get<SftpBookmark[]>('sftpBookmarks') || [],
      projectGroup: config.get<string[]>('projectGroup') || [],
      ndkHome: config.get('ndkHome', ''),
      privateKeyPath: config.get('privateKeyPath', ''),
    };
    DugConfig.DUC = {
      simulationVersion: config.get('simulationVersion', ''),
    };
  }

  static async updateConfiguration(project: string, key: string, value: any): Promise<void> {
    const config = workspace.getConfiguration(project);
    await config.update(key, value, true, true);
    DugConfig.configInit();
  }

  static settingValidate(options: { jvmHome: string; gradleHome: string; projectGroup: string[]; privateKeyPath: string }): boolean {
    const errors = [];
    errors.push(this.validatePath(options.jvmHome, 'JVM 8 HOME', 'bin/java'));
    errors.push(this.validatePath(options.gradleHome, 'Gradle 2.14 HOME', 'bin/gradle'));
    errors.push(this.validatePrivateKey(options.privateKeyPath));

    if (errors.filter((x) => x).length > 0) {
      ExtensionUtil.handleError('Setting Error', errors.join('\n'), true);
      return false;
    }

    return true;
  }

  private static validatePath(pathToCheck: string, name: string, executablePath: string): string {
    if (!pathToCheck) return;

    if (fs.existsSync(pathToCheck)) {
      const execPath = path.join(pathToCheck, executablePath);
      if (!fs.existsSync(execPath)) {
        return `${name} 실행 파일을 찾을 수 없습니다.`;
      }
    } else {
      return `${name} 폴더를 찾을 수 없습니다.`;
    }
  }

  private static validatePrivateKey(keyPath: string): string {
    if (!keyPath) return;

    if (fs.existsSync(keyPath)) {
      const content = fs.readFileSync(keyPath, 'utf8');
      const keyPatterns = ['-----BEGIN OPENSSH PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----', '-----BEGIN ENCRYPTED PRIVATE KEY-----', 'PuTTY-User-Key-File-2'];
      const isKey = keyPatterns.some((pattern) => content.includes(pattern));
      if (!isKey) {
        return 'Private Key File이 아닙니다.';
      }
    } else {
      return 'Private Key File을 찾을 수 없습니다.';
    }
  }

  static async verifyTomcat(catalinaHome: string): Promise<boolean> {
    try {
      const isValidTomcat = this.validatePath(catalinaHome, 'Tomcat 8.5 Home', '');
      if (isValidTomcat) {
        ExtensionUtil.handleError('Setting Error', isValidTomcat, true);
        return;
      }
      const isValidHome = this.verifyRequiredFiles(catalinaHome, ['conf', 'logs', 'webapps']);
      const isValidBin = this.verifyRequiredFiles(path.join(catalinaHome, 'bin'), ['catalina.bat', 'catalina.sh', 'shutdown.bat', 'shutdown.sh']);
      return isValidHome && isValidBin;
    } catch (error: any) {
      ExtensionUtil.handleError('Setting Error', error, true);
    }
    return false;
  }

  private static verifyRequiredFiles(directory: string, requiredFiles: string[]): boolean {
    try {
      const files = fs.readdirSync(directory);
      const fileSet = new Set<string>(files);

      for (const file of requiredFiles) {
        if (!fileSet.has(file)) {
          return false;
        }
      }
      return true;
    } catch (error: any) {
      ExtensionUtil.handleError('디렉토리 검증 중 오류가 발생했습니다.', error, true);
      return false;
    }
  }

  static async selectTomcat(name: string = undefined): Promise<Tomcat> {
    const tomcatInfo = await this.getTomcatInfo(name);
    if (!tomcatInfo) return;

    let tomcat = DugConfig.activatedTomcat.find((x) => x.name == tomcatInfo.name && x.catalinaHome == tomcatInfo.catalinaHome);
    if (!tomcat) {
      tomcat = new Tomcat(tomcatInfo);
      new Promise<void>((resolve, reject) => {
        const chmodProc = spawn('chmod', ['-R', '777', tomcatInfo.catalinaHome]);
        chmodProc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`톰캣 권한 설정 오류: ${tomcatInfo.catalinaHome}. Exit code: ${code}`));
          } else {
            resolve();
          }
        });
        chmodProc.on('error', (error) => {
          reject(new Error(`톰캣 권한 설정 오류: ${tomcatInfo.catalinaHome}: ${error.message}`));
        });
      });
      DugConfig.activatedTomcat.push(tomcat);
    }
    return tomcat;
  }

  private static async getTomcatInfo(name: string): Promise<TomcatInfo> {
    let tomcatInfo: TomcatInfo;
    if (!name && DugConfig.DUG.tomcatInstances.length == 1) {
      tomcatInfo = DugConfig.DUG.tomcatInstances[0];
    } else if (name) {
      tomcatInfo = DugConfig.DUG.tomcatInstances.find((info) => info.name == name);
    } else {
      const items = DugConfig.DUG.tomcatInstances.map((instance) => ({
        label: instance.name,
        description: instance.catalinaHome,
        instance,
      }));
      const item = await ExtensionUtil.quickPick('Tomcat Instance', items);
      if (!item) return undefined;
      tomcatInfo = item.instance;
    }

    if (!tomcatInfo) {
      ExtensionUtil.handleError('Tomcat 정보를 찾을 수 없습니다.');
      await commands.executeCommand('dug.dug.setting');
    }
    return tomcatInfo;
  }

  static async addTomcat(info: TomcatInfo = undefined): Promise<void> {
    if (!info) {
      info = await this.getTomcatInfoInput();
      if (!info) return;
    }
    if (!(await DugConfig.verifyTomcat(info.catalinaHome))) return;

    DugConfig.DUG.tomcatInstances.push(info);
    await DugConfig.updateConfiguration('DUG', 'tomcatInstances', DugConfig.DUG.tomcatInstances);
    await commands.executeCommand('dugExplorer.tomcat.refresh');
  }

  private static async getTomcatInfoInput(): Promise<TomcatInfo> {
    const name = await ExtensionUtil.getString('Tomcat Name');
    if (!name) return;
    if (DugConfig.DUG.tomcatInstances.some((instance) => instance.name === name)) {
      ExtensionUtil.handleError('Tomcat 이름이 이미 존재합니다.');
      return;
    }

    const catalinaHome = await ExtensionUtil.getString('Tomcat Catalina Home');
    if (!catalinaHome) return;

    return { name, catalinaHome };
  }

  static async selectSftp(name: string = undefined): Promise<Sftp> {
    const sftpInfo = await this.getSftpInfo(name);
    if (!sftpInfo) return;

    let sftp = DugConfig.activatedSftp.find((x) => x.name == sftpInfo.name);
    if (!sftp) {
      sftp = new Sftp(sftpInfo);
      DugConfig.activatedSftp.push(sftp);
    }
    return sftp;
  }

  private static async getSftpInfo(name: string): Promise<SftpInfo> {
    let sftpInfo: SftpInfo;
    if (!name && DugConfig.DUG.sftpInstances.length == 1) {
      sftpInfo = DugConfig.DUG.sftpInstances[0];
    } else if (name) {
      sftpInfo = DugConfig.DUG.sftpInstances.find((info) => info.name == name);
    } else {
      const items = DugConfig.DUG.sftpInstances.map((instance) => ({
        label: instance.name,
        description: `${instance.user}@${instance.host}:${instance.port}`,
        instance,
      }));
      const item = await ExtensionUtil.quickPick('SFTP Instance', items);
      if (!item) return undefined;
      sftpInfo = item.instance;
    }

    if (!sftpInfo) {
      ExtensionUtil.handleError('SFTP 정보를 찾을 수 없습니다.');
      await commands.executeCommand('dug.dug.setting');
    }
    return sftpInfo;
  }

  static async addSftp(info: SftpInfo = undefined): Promise<void> {
    if (!info) {
      info = await this.getSftpInfoInput();
      if (!info) return;
    }

    DugConfig.DUG.sftpInstances.push(info);
    await DugConfig.updateConfiguration('DUG', 'sftpInstances', DugConfig.DUG.sftpInstances);
    await commands.executeCommand('dugExplorer.sftp.refresh');
  }

  private static async getSftpInfoInput(): Promise<SftpInfo> {
    const name = await ExtensionUtil.getString('SFTP Name');
    if (!name) return;
    else if (DugConfig.DUG.sftpInstances.some((instance) => instance.name === name)) {
      ExtensionUtil.handleError('SFTP 이름이 이미 존재합니다.');
      return;
    }

    const host = await ExtensionUtil.getString('SFTP Host');
    if (!host) return;

    const user = await ExtensionUtil.getString('SFTP User');
    if (!user) return;

    const port = await ExtensionUtil.getNumber('SFTP Port');
    if (!port) return;

    return { name, host, user, port };
  }

  static async selectBookmark(): Promise<SftpBookmark> {
    if (DugConfig.DUG.sftpBookmarks.length == 0) {
      window.showWarningMessage('저장된 Bookmark가 없습니다');
      return;
    }
    const items = DugConfig.DUG.sftpBookmarks.map((bookmark) => ({
      label: bookmark.server,
      description: bookmark.path,
      bookmark,
    }));
    const item = await ExtensionUtil.quickPick('Bookmark', items);
    if (!item) return undefined;
    return item.bookmark;
  }

  static async addBookmark(bookmark: SftpBookmark): Promise<void> {
    DugConfig.DUG.sftpBookmarks.push({ server: bookmark.server, path: bookmark.path });
    await DugConfig.updateConfiguration('DUG', 'sftpBookmarks', DugConfig.DUG.sftpBookmarks);
  }
}

export default DugConfig;
