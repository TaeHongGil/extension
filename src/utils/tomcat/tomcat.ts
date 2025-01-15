import { exec, spawn } from 'child_process';
import * as vscode from 'vscode';
import { OutputChannel, window, workspace } from 'vscode';
import DugConfig, { TomcatInfo } from '../../config/dug-config';
import ExtensionUtil from '../extension-util';
import { TomcatLogs } from './tomcat-logs';
import path = require('path');

export class Tomcat {
  catalinaScript: string;
  name: string;
  catalinaHome: string;
  running: boolean;
  tomcatLogs: TomcatLogs;
  private outputChannel: OutputChannel;
  private init: boolean;

  constructor(info: TomcatInfo) {
    this.catalinaScript = './catalina.sh';
    this.catalinaHome = info.catalinaHome;
    this.name = info.name;
    this.running = false;
    this.tomcatLogs = new TomcatLogs(this.catalinaHome);
    this.outputChannel = undefined;
    this.init = true;
  }

  async tomcatRun(): Promise<void> {
    if (this.running) {
      window.showInformationMessage('Tomcat이 이미 실행 중입니다.');
      return;
    }

    const cmd = this.catalinaScript + ' jpda run';
    const proc = this.spawnProcess(cmd, path.join(this.catalinaHome, 'bin'), 'Tomcat 시작 중');

    this.running = true;
    this.handleProcessOutput(proc, this.handleTomcatStartup.bind(this));
    this.handleProcessError(proc);
  }

  async stopTomcat(): Promise<void> {
    if (!this.running) {
      window.showInformationMessage('Tomcat이 실행 중이 아닙니다.');
      return;
    }

    if (!this.init) {
      window.showInformationMessage('Tomcat 설정 확인');
      return;
    }

    const cmd = this.catalinaScript + ' stop';
    const proc = this.spawnProcess(cmd, path.resolve(this.catalinaHome, 'bin'), 'Tomcat 중지 중');

    this.running = false;
    this.handleProcessOutput(proc);
    this.handleProcessError(proc);
  }

  private spawnProcess(command: string, cwd: string, envMsg: string): ReturnType<typeof spawn> {
    const proc = spawn(command, { shell: true, cwd, env: { JAVA_HOME: DugConfig.DUG.jvmHome } });
    this.getOutputChannel().clear();
    this.getOutputChannel().appendLine(envMsg);
    return proc;
  }

  private handleProcessOutput(proc: ReturnType<typeof spawn>, callback?: (data: string) => void) {
    proc.stdout.on('data', (data: string) => {
      this.getOutputChannel().appendLine(data);
      callback?.(data);
    });

    proc.stderr.on('data', (data: string) => {
      this.getOutputChannel().appendLine(data);
    });

    proc.on('close', (code: string) => {
      this.getOutputChannel().appendLine(`프로세스가 코드 ${code}로 종료되었습니다.`);
      this.getOutputChannel().appendLine('Tomcat이 중지되었습니다.');
      this.running = false;
    });
  }

  private handleProcessError(proc: ReturnType<typeof spawn>) {
    proc.on('error', (data: string) => {
      this.getOutputChannel().appendLine(`오류: ${data}`);
    });
  }

  private handleTomcatStartup(data: string) {
    if (data.includes('Listening for transport dt_socket')) {
      this.getOutputChannel().appendLine('Tomcat이 성공적으로 시작되었습니다. 디버그 세션을 시작합니다...');
      vscode.debug
        .startDebugging(
          vscode.workspace.workspaceFolders[0],
          {
            name: `DUG - ${this.name} Tomcat`,
            type: 'java',
            request: 'attach',
            hostName: 'localhost',
            port: 8000,
          },
          { suppressDebugView: true },
        )
        .then(
          () => this.getOutputChannel().appendLine('디버그 세션이 성공적으로 시작되었습니다.'),
          (error: Error) => this.getOutputChannel().appendLine(`디버그 세션 시작 실패: ${error.message}`),
        );
    }
    this.getOutputChannel().show(true);
  }

  getOutputChannel(): OutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = window.createOutputChannel(`DUG - ${this.name} Tomcat`);
    }
    return this.outputChannel;
  }

  disposeOutputChannel(): void {
    if (this.outputChannel) {
      this.outputChannel.clear();
      this.outputChannel.hide();
      this.outputChannel.dispose();
    }
  }

  async openCatalinaHome(): Promise<void> {
    const homePath = path.resolve(this.catalinaHome);
    exec(`open "${homePath}"`, (error) => {
      if (error) {
        ExtensionUtil.handleError('폴더 열기 실패', error);
      }
    });
  }

  async openServerXml(): Promise<void> {
    await this.openFile(path.join(this.catalinaHome, 'conf/server.xml'), 'server.xml 파일 열기 실패');
  }

  async openLogFile(): Promise<void> {
    try {
      const options = this.tomcatLogs.getFilePatterns();
      const selectedLogFile = await window.showQuickPick(options);
      if (!selectedLogFile) return;
      const filePath = this.tomcatLogs.getLogFilePath(selectedLogFile + '.');
      await this.openFile(filePath, '로그 파일 열기 실패');
    } catch (error) {
      ExtensionUtil.handleError('로그 파일 열기 실패', error);
    }
  }

  private async openFile(filePath: string, errorMessage: string) {
    try {
      const doc = await workspace.openTextDocument(filePath);
      await window.showTextDocument(doc);
    } catch (error) {
      ExtensionUtil.handleError(errorMessage, error);
    }
  }
}
