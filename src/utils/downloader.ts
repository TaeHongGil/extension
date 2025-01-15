import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { ProgressLocation, window } from 'vscode';
import ExtensionUtil from './extension-util';

export class Downloader {
  static async download(downloadUrl: string, directoryPath: fs.PathLike, fileName: string): Promise<void> {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `${fileName} Download`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `진행률: 0%`, increment: 0 });

        try {
          fs.mkdirSync(directoryPath, { recursive: true });
          fs.chmodSync(directoryPath, 0o777);
        } catch (error: any) {
          ExtensionUtil.handleError('디렉터리 생성 중 오류가 발생했습니다', error);
          throw error;
        }

        const filePath = path.join(directoryPath.toString(), fileName);
        const writer = fs.createWriteStream(filePath);

        try {
          const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
          });

          const totalLength = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedLength = 0;
          let lastReportedProgress = 0;

          response.data.on('data', (chunk: string | any[]) => {
            downloadedLength += chunk.length;
            if (totalLength > 0) {
              const downloadProgress = (downloadedLength / totalLength) * 100;
              const increment = downloadProgress - lastReportedProgress;
              lastReportedProgress = downloadProgress;
              progress.report({ message: `진행률: ${downloadProgress.toFixed(2)}%`, increment });
            }
          });

          response.data.pipe(writer);

          await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => {
              setTimeout(resolve, 1000);
            });

            writer.on('error', (error) => {
              ExtensionUtil.handleError('파일 저장 중 오류가 발생했습니다', error);
              reject(error);
            });
          });
        } catch (error: any) {
          ExtensionUtil.handleError('파일 다운로드 중 오류가 발생했습니다', error);
          throw error;
        }
      },
    );
  }
}

export default Downloader;
