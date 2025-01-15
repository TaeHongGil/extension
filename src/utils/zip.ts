import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { env, ProgressLocation, window } from 'vscode';
import yauzl from 'yauzl';
import ExtensionUtil from './extension-util';

export class Zip {
  static async unzip(zipPath: string, fileName: string): Promise<void> {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `${fileName} unzip`,
        cancellable: false,
      },
      async (progress) => {
        return new Promise<void>((resolve, reject) => {
          let lastProgress = 0;
          let extractionProgress = 0;
          const directoryPath = path.dirname(zipPath);
          progress.report({ message: ` 진행률: 0%`, increment: 0 });

          yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
            if (error) {
              ExtensionUtil.handleError('ZIP 파일 열기 중 오류가 발생했습니다', error);
              return reject(error);
            }

            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
              if (entry.fileName.startsWith('__MACOSX/')) {
                zipfile.readEntry();
                return;
              }

              const entryPath = path.join(directoryPath, entry.fileName);
              const entryDir = path.dirname(entryPath);
              if (!fs.existsSync(entryDir)) {
                fs.mkdirSync(entryDir, { recursive: true });
              }

              if (/\/$/.test(entry.fileName)) {
                fs.mkdirSync(entryPath, { recursive: true });
                fs.chmodSync(entryPath, 0o775);
                zipfile.readEntry();
              } else {
                zipfile.openReadStream(entry, (error, readStream) => {
                  if (error) {
                    ExtensionUtil.handleError('파일 스트림 열기 중 오류가 발생했습니다', error);
                    return reject(error);
                  }

                  const writeStream = fs.createWriteStream(entryPath);

                  readStream.on('error', (error) => {
                    ExtensionUtil.handleError('스트림 읽기 중 오류가 발생했습니다', error);
                    return reject(error);
                  });

                  writeStream.on('error', (error) => {
                    ExtensionUtil.handleError('파일 쓰기 중 오류가 발생했습니다', error);
                    return reject(error);
                  });

                  writeStream.on('finish', () => {
                    fs.chmodSync(entryPath, 0o775);
                    extractionProgress += (1 / zipfile.entryCount) * 100;
                    const combinedProgress = extractionProgress;
                    const increment = combinedProgress - lastProgress;
                    lastProgress = combinedProgress;
                    progress.report({ message: ` 진행률: ${combinedProgress.toFixed(2)}%`, increment: increment });
                    zipfile.readEntry();
                  });

                  readStream.pipe(writeStream);
                });
              }
            });

            zipfile.on('end', () => {
              progress.report({ message: ` 진행률: 100%`, increment: 100 });
              setTimeout(resolve, 1000);
            });

            zipfile.on('error', (error) => {
              ExtensionUtil.handleError('압축 해제 중 오류가 발생했습니다', error);
              reject(error);
            });
          });
        });
      },
    );
  }

  static async zip(parentDirectory: string, folderName: string): Promise<void> {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `${folderName} Zipping`,
        cancellable: false,
      },
      async (progress) => {
        return new Promise<void>((resolve, reject) => {
          const folderPath = path.join(parentDirectory, folderName);
          const zipPath = path.join(parentDirectory, `${folderName}.zip`);
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });

          const countEntries = (dir: string): number => {
            let entryCount = 0;
            const items = fs.readdirSync(dir);
            items.forEach((item) => {
              const fullPath = path.join(dir, item);
              entryCount += 1;
              if (fs.statSync(fullPath).isDirectory()) {
                entryCount += countEntries(fullPath);
              }
            });
            return entryCount;
          };

          const totalFiles = countEntries(folderPath);
          let processedFiles = 0;
          let lastProgress = 0;

          output.on('error', (error) => {
            ExtensionUtil.handleError('파일 스트림 오류가 발생했습니다', error);
            reject(error);
          });

          archive.on('error', (error) => {
            ExtensionUtil.handleError('ZIP 파일 작성 중 오류가 발생했습니다', error);
            reject(error);
          });

          archive.on('entry', () => {
            processedFiles += 1;
            const percent = (processedFiles / totalFiles) * 100;
            const increment = percent - lastProgress;
            lastProgress = percent;
            progress.report({ message: `진행률: ${percent.toFixed(2)}%`, increment: increment > 0 ? increment : 0 });
          });

          output.on('close', () => {
            progress.report({ message: '진행률: 100%', increment: 100 - lastProgress });
            setTimeout(resolve, 1000);
          });

          archive.pipe(output);
          archive.directory(folderPath, folderName);

          archive.finalize().catch((error) => {
            ExtensionUtil.handleError('압축 작업을 마무리하는 중 오류가 발생했습니다', error);
            reject(error);
          });
        });
      },
    );
  }

  static async getZipSize(zipPath: string): Promise<number> {
    const compressedSize = fs.statSync(zipPath).size;

    const getUncompressedSize = (): Promise<number> => {
      return new Promise<number>((resolve, reject) => {
        let totalUncompressedSize = 0;

        yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
          if (error) {
            ExtensionUtil.handleError('ZIP 파일 열기 중 오류가 발생했습니다', error);
            return reject(error);
          }

          zipfile.readEntry();
          zipfile.on('entry', (entry) => {
            if (!/\/$/.test(entry.fileName)) {
              totalUncompressedSize += entry.uncompressedSize;
            }
            zipfile.readEntry();
          });

          zipfile.on('end', () => {
            resolve(totalUncompressedSize);
          });

          zipfile.on('error', (error) => {
            ExtensionUtil.handleError('압축 해제 중 오류가 발생했습니다', error);
            reject(error);
          });
        });
      });
    };

    try {
      const totalUncompressedSize = await getUncompressedSize();
      const message = `압축된 파일 크기: ${compressedSize} bytes, 압축 해제된 파일 크기: ${totalUncompressedSize} bytes`;
      window.showInformationMessage(message, '복사하기').then((copy) => {
        if (copy === '복사하기') {
          env.clipboard.writeText(`${compressedSize}, ${totalUncompressedSize}`);
          window.showInformationMessage('내용이 클립보드에 복사되었습니다.');
        }
      });
      return totalUncompressedSize;
    } catch (error: any) {
      ExtensionUtil.handleError('압축 크기 계산 중 오류가 발생했습니다', error);
      throw error;
    }
  }
}

export default Zip;
