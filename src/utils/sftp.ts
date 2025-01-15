import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import fs from 'fs';
import { isText } from 'istextorbinary';
import * as path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { commands, window, workspace } from 'vscode';
import { DugConfig, SftpInfo } from '../config/dug-config';
import ExtensionUtil from './extension-util';
dayjs.extend(utc);
dayjs.extend(timezone);

export interface FileInfo {
  path: string;
  isDirectory: boolean;
}

export class Sftp {
  client: SftpClient;
  name: string;
  host: string;
  user: string;
  port: number;
  isConnected: boolean;

  constructor(info: SftpInfo) {
    this.client = new SftpClient();
    this.name = info.name;
    this.host = info.host;
    this.user = info.user;
    this.port = info.port;
    this.isConnected = false;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    await ExtensionUtil.executeWithProgress('Connect', async (progress) => {
      progress.report({ increment: 0, message: '연결 시도 중...' });
      await this.client.connect({
        host: this.host,
        port: this.port,
        username: this.user,
        privateKey: fs.readFileSync(DugConfig.DUG.privateKeyPath),
        timeout: 5000,
      });
      this.isConnected = true;
      progress.report({ increment: 100, message: '연결 성공' });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.end();
      this.isConnected = false;
    } catch (error: any) {
      ExtensionUtil.handleError('Disconnect', error);
    }
  }

  async list(remotePath: string): Promise<FileInfo[]> {
    try {
      const list = await this.client.list(remotePath);
      return list.map((file) => ({
        path: path.posix.join(remotePath, file.name),
        isDirectory: file.type === 'd',
      }));
    } catch (error: any) {
      ExtensionUtil.handleError('디렉토리 목록 불러오기 실패', error);
      return [];
    }
  }

  async upload(remoteDirectoryPath: string, remoteFileName: string, localPath: string): Promise<void> {
    await ExtensionUtil.executeWithProgress('Upload', async (progress) => {
      progress.report({ increment: 0, message: '업로드 준비 중...' });
      if (!localPath) return;

      const isDirectory = fs.lstatSync(localPath).isDirectory();
      const fullPath = path.posix.join(remoteDirectoryPath, remoteFileName);
      let upload = true;

      if (await this.client.exists(fullPath)) {
        upload = await ExtensionUtil.confirmModal('이미 파일이 존재합니다.\n 진행 하시겠습니까?');
      }
      if (!upload) return;

      await this.client.mkdir(remoteDirectoryPath, true);

      if (isDirectory) {
        progress.report({ increment: 50, message: '디렉토리 업로드 중...' });
        await this.client.uploadDir(localPath, fullPath);
      } else {
        progress.report({ increment: 50, message: '파일 업로드 중...' });
        await this.client.put(localPath, fullPath);
      }

      progress.report({ increment: 100, message: '업로드 완료' });
      commands.executeCommand('dugExplorer.sftp.refresh');
    });
  }

  async download(remotePath: string, isDirectory: boolean): Promise<void> {
    await ExtensionUtil.executeWithProgress('Download', async (progress) => {
      progress.report({ increment: 0, message: '다운로드 준비 중...' });
      const localDirectoryPath = (await ExtensionUtil.selectFolder())?.fsPath;
      if (!localDirectoryPath) return;

      const name = path.basename(remotePath);
      const fullPath = path.join(localDirectoryPath, name);

      if (isDirectory) {
        fs.mkdirSync(fullPath, { recursive: true });
        progress.report({ increment: 50, message: '디렉토리 다운로드 중...' });
        await this.client.downloadDir(remotePath, fullPath);
      } else {
        progress.report({ increment: 50, message: '파일 다운로드 중...' });
        await this.client.get(remotePath, fullPath);
      }

      progress.report({ increment: 100, message: '다운로드 완료' });
    });
  }

  async delete(remotePath: string): Promise<void> {
    await ExtensionUtil.executeWithProgress('Delete', async (progress) => {
      progress.report({ increment: 0, message: '삭제 준비 중...' });
      const confirmDelete = await ExtensionUtil.confirmModal(`${remotePath} 삭제하시겠습니까?`);
      if (!confirmDelete) return;

      const isDirectory = (await this.client.stat(remotePath))?.isDirectory;
      const confirmBackup = await ExtensionUtil.confirmModal(`백업하시겠습니까?`);
      if (confirmBackup) {
        progress.report({ increment: 40, message: '백업 중...' });
        const backupSuccess = await this.backup(remotePath, isDirectory);
        if (!backupSuccess) return;
      }

      if (isDirectory) {
        progress.report({ increment: 80, message: '디렉토리 삭제 중...' });
        await this.client.rmdir(remotePath, true);
      } else {
        progress.report({ increment: 80, message: '파일 삭제 중...' });
        await this.client.delete(remotePath);
      }

      progress.report({ increment: 100, message: '삭제 완료' });
      commands.executeCommand('dugExplorer.sftp.bookmark.expand', this.name, path.dirname(remotePath));
    });
  }

  async mkdir(remotePath: string, isDirectory: boolean): Promise<void> {
    await ExtensionUtil.executeWithProgress('Create Folder', async (progress) => {
      const folderName = await ExtensionUtil.getString('Folder Name');
      if (!folderName) return;

      const targetPath = isDirectory ? remotePath : path.dirname(remotePath);
      const fullPath = path.posix.join(targetPath, folderName);
      await this.client.mkdir(fullPath, true);

      window.showInformationMessage(`폴더 생성 성공: ${fullPath}`);
      commands.executeCommand('dugExplorer.sftp.refresh');
    });
  }

  async preview(remotePath: string): Promise<void> {
    await ExtensionUtil.executeWithProgress('Preview', async (progress) => {
      let fileBuffer: Buffer;

      progress.report({ increment: 0, message: '파일 읽는 중...' });
      try {
        fileBuffer = (await this.client.get(remotePath, undefined as any)) as Buffer;
        progress.report({ increment: 100, message: '파일 읽기 완료' });
      } catch (error: any) {
        ExtensionUtil.handleError('파일 읽기 실패:', error);
        throw error;
      }

      if (!isText(undefined, fileBuffer)) {
        ExtensionUtil.handleError(`미리보기를 지원하지 않는 바이너리 파일입니다: ${remotePath}`);
        return;
      }

      const fileContentStr = fileBuffer.toString('utf-8');
      const document = await workspace.openTextDocument({ content: fileContentStr, language: 'plaintext' });
      await window.showTextDocument(document);
    });
  }

  async backup(remotePath: string, isDirectory: boolean): Promise<boolean> {
    return ExtensionUtil.executeWithProgress('Backup', async (progress) => {
      const name = path.basename(remotePath);
      const localBackupPath = path.join(DugConfig.dugSettingPath, 'backup', `${name}-${dayjs().tz('Asia/Seoul').format('YY-MM-DD-HH-mm-ss')}`);

      if (isDirectory) {
        fs.mkdirSync(localBackupPath, { recursive: true });
        progress.report({ increment: 50, message: '디렉토리 백업 중...' });
        await this.client.downloadDir(remotePath, localBackupPath);
      } else {
        fs.mkdirSync(path.dirname(localBackupPath), { recursive: true });
        progress.report({ increment: 50, message: '파일 백업 중...' });
        await this.client.get(remotePath, localBackupPath);
      }

      progress.report({ increment: 100, message: '백업 완료' });
    })
      .then(() => true)
      .catch(() => false);
  }
}
