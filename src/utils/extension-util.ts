import * as vscode from 'vscode';
import { ProgressLocation, QuickPickItem, Terminal, window } from 'vscode';
import DugConfig from '../config/dug-config';

export class ExtensionUtil {
  static createDefaultTerminal(terminalName: string, folderPath: string): Terminal {
    const terminal = vscode.window.createTerminal({
      name: terminalName,
      hideFromUser: false,
    });
    terminal.show();
    terminal.sendText('export GRADLE_HOME=' + DugConfig.DUG.gradleHome);
    terminal.sendText('export PATH=$GRADLE_HOME/bin:$PATH');
    terminal.sendText('export JAVA_HOME=' + DugConfig.DUG.jvmHome);
    terminal.sendText('export PATH=${PATH}:$JAVA_HOME/bin');
    terminal.sendText('cd ' + folderPath);
    return terminal;
  }

  static async selectAnything(): Promise<vscode.Uri> {
    const any = await window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: true,
      canSelectMany: false,
      openLabel: 'Select',
    });

    if (!any || any.length === 0) {
      ExtensionUtil.handleError(`폴더 및 파일을 선택하지 않았습니다.`);
      return undefined;
    }

    return any[0];
  }

  static async selectFolder(): Promise<vscode.Uri> {
    const folder = await window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select',
    });

    if (!folder || folder.length === 0) {
      ExtensionUtil.handleError(`폴더를 선택하지 않았습니다.`);
      return undefined;
    }

    return folder[0];
  }

  static async selectFile(filter: { [name: string]: string[] } = undefined): Promise<vscode.Uri> {
    const file = await window.showOpenDialog({
      filters: filter,
      canSelectFolders: false,
      canSelectFiles: true,
      canSelectMany: false,
      openLabel: 'Select',
    });

    if (!file || file.length === 0) {
      ExtensionUtil.handleError(`파일를 선택하지 않았습니다.`);
      return undefined;
    }

    return file[0];
  }

  static async getNumber(title: string): Promise<number> {
    const number = await window.showInputBox({
      placeHolder: title,
      prompt: title,
    });
    if (!number || !/^\d+$/.test(number)) {
      ExtensionUtil.handleError(`${title} 를 입력해주세요.`);
      return undefined;
    }

    return Number(number);
  }

  static async getString(title: string): Promise<string> {
    const str = await window.showInputBox({
      placeHolder: title,
      prompt: title,
    });

    if (!str) {
      ExtensionUtil.handleError(`${title} 를 입력해주세요.`);
      return undefined;
    }

    return str;
  }

  static async quickPick<T extends QuickPickItem>(title: string, items: T[]): Promise<T> {
    const version = await window.showQuickPick(items, {
      placeHolder: title,
    });

    if (!version) {
      ExtensionUtil.handleError(`${title} 선택하지 않았습니다.`);
      return undefined;
    }

    return version;
  }

  static async confirmModal(text: string) {
    const confirmDelete = await window.showWarningMessage(text, { modal: true }, '확인');
    if (confirmDelete == '확인') {
      return true;
    }
    return false;
  }

  static async executeWithProgress<T>(title: string, task: (progress: any) => Promise<T>): Promise<T> {
    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      async (progress) => {
        try {
          return await task(progress);
        } catch (error: any) {
          this.handleError(`${title} 실패`, error);
          throw error;
        }
      },
    );
  }

  static handleError(message: string, error: any = undefined, modal = false): void {
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error == undefined) {
      errorMessage = '';
    } else {
      errorMessage = '알 수 없는 오류가 발생했습니다.';
    }

    if (modal) {
      window.showErrorMessage(message, { modal: true, detail: errorMessage });
    } else if (errorMessage) {
      window.showErrorMessage(`${message}: ${errorMessage}`);
    } else {
      window.showErrorMessage(`${message}`);
    }
    console.error(`${message}:`, errorMessage);
  }
}

export default ExtensionUtil;
