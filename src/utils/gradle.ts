import * as fs from 'fs';
import path from 'path';
import { ExtensionContext, TreeItem, workspace } from 'vscode';
import DugConfig from '../config/dug-config';
import ExtensionUtil from './extension-util';

export class Gradle {
  static async gradleTask(context: ExtensionContext, directory: TreeItem, publish = false): Promise<void> {
    const tomcat = await DugConfig.selectTomcat();
    if (!tomcat) {
      return;
    }
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Gradle Task', targetPath);
    if (publish) {
      await Gradle.publishAnimate(context, targetPath + '/src/main/animate');
      terminal.sendText(`eval "/Applications/Adobe\\ Animate\\ CC\\ 2019/Adobe\\ Animate\\ CC\\ 2019.app/Contents/MacOS/Adobe\\ Animate\\ CC\\ 2019" "${context.extensionPath}/script/test.jsfl"`);
    }
    terminal.sendText(DugConfig.DUG.gradleHome + '/bin/gradle deployCdnAnimateSlot');
    if (workspace.workspaceFolders) {
      terminal.sendText(`rsync -ruv --delete ${workspace.workspaceFolders[0].uri.fsPath}/dug-cdn-web/src/main/webapp/ ${tomcat.catalinaHome}/webapps/dug-cdn-web/`);
    }
  }

  static async publishAnimate(context: ExtensionContext, targetPath: string): Promise<void> {
    targetPath = `file://${targetPath}`;
    const data = `\
    var folderURI = '${targetPath}';\n \
    var folderContents = FLfile.listFolder(folderURI);\n\
    for (var i = 0; i < folderContents.length; i++) {\n\
      if (folderContents[i].indexOf('.fla') > -1) {\n\
        var doc = fl.openDocument(folderURI + '/' + folderContents[i]);\n\
        doc.publish();\n\
        doc.close();\n\
      }\n\
    }\n\
    fl.quit(true);\n\
    `;
    fs.writeFileSync(path.join(context.extensionPath, '/script/test.jsfl'), data);
  }
}

export default Gradle;
