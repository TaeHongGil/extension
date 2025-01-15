// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as date from 'date-and-time';
import * as vscode from 'vscode';
import { TreeItem, workspace } from 'vscode';
import DugConfig from '../config/dug-config';
import ExtensionUtil from './extension-util';

export class Maven {
  static async createSimul(): Promise<void> {
    const slotNum = await ExtensionUtil.getNumber('Slot Number');
    if (!slotNum) return;
    const terminal = ExtensionUtil.createDefaultTerminal('Create Siulation Project', workspace.workspaceFolders[0].uri.fsPath);
    const commandParts = [
      'mvn org.apache.maven.plugins:maven-archetype-plugin:3.1.2:generate',
      '-DarchetypeArtifactId="duc-simulation-arch"',
      '-DarchetypeGroupId="com.doubleugames.dug"',
      '-DarchetypeVersion="LATEST"',
      '-DgroupId="com.doubleugames.dug.duc"',
      '-Dpackage="com.doubleugames.dug.duc"',
      `-DartifactId="dug-simulation-slot-${slotNum}"`,
      '-Dversion="2.0.0.00"',
      `-Dslotname="${slotNum}"`,
      `-Dsimulcorever="${DugConfig.DUC.simulationVersion}"`,
      `-Dslotnumber="${slotNum}"`,
      '-B',
      '-DinteractiveMode=false',
      '-DconfirmInstallation=y',
    ];
    const command = commandParts.join(' ');
    terminal.sendText(command);
  }

  static async createUi(): Promise<void> {
    const slotNum = await ExtensionUtil.getNumber('Slot Number');
    if (!slotNum) return;
    const slotName = await ExtensionUtil.getString('Slot Name');
    if (!slotName) return;

    const regExpName = /[ {}[\]/?.,;:|)*~`!^\-_+<>@#$%&\\=('"]/g;
    const slotClassName = 'CSlot' + slotNum + slotName.replace(regExpName, '');
    const time = date.format(new Date(), 'YYYY.MM.DD');

    const terminal = ExtensionUtil.createDefaultTerminal('Create Ui Project', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const commandParts = [
      'mvn org.apache.maven.plugins:maven-archetype-plugin:3.1.2:generate',
      '-DarchetypeArtifactId="duc-archetype-ui-slot"',
      '-DarchetypeGroupId="com.doubleugames.dug.duc"',
      '-DarchetypeVersion="LATEST"',
      '-DgroupId="com.doubleugames.dug.duc"',
      '-Dpackage="com.doubleugames.dug.duc"',
      `-DartifactId="duc-ui-slot-${slotNum}"`,
      '-Dversion="2.0.0.00"',
      `-DslotType="${slotNum}"`,
      `-DslotName="${slotName}"`,
      `-DslotClassName="${slotClassName}"`,
      `-DcurrentDate="${time}"`,
      '-B',
      '-DinteractiveMode=false',
      '-DconfirmInstallation=y',
    ];
    const command = commandParts.join(' ');
    terminal.sendText(command);
  }

  static async createMetaUi(): Promise<void> {
    const regExpBase = /^[a-zA-Z0-9]*$/;
    const tsCheck = await ExtensionUtil.getString('typescript check: y or n');
    if (!tsCheck) return;
    const artifactId = await ExtensionUtil.getString('Artifact Id');
    if (!artifactId) return;
    const metaType = await ExtensionUtil.getString('Base directory');
    if (!metaType) return;
    const metaClassName = await ExtensionUtil.getString('Class Name');
    if (!metaClassName) return;

    const time = date.format(new Date(), 'YYYY.MM.DD');
    const terminal = ExtensionUtil.createDefaultTerminal('Create Meta Ui Project', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const commandParts = [
      'mvn org.apache.maven.plugins:maven-archetype-plugin:3.1.2:generate',
      `-DarchetypeArtifactId="duc${tsCheck === 'y' ? '-ts' : ''}-archetype-ui-meta"`,
      '-DarchetypeGroupId="com.doubleugames.dug"',
      '-DarchetypeVersion="LATEST"',
      '-DgroupId="com.doubleugames.dug"',
      '-Dpackage="com.doubleugames.dug"',
      `-DartifactId="duc-ui-meta-common-${artifactId}"`,
      '-Dversion="2.0.0.00"',
      `-DmetaType="${metaType}"`,
      `-DmetaClassName="${metaClassName}"`,
      `-DcurrentDate="${time}"`,
      '-B',
      '-DinteractiveMode=false',
      '-DconfirmInstallation=y',
    ];
    const command = commandParts.join(' ');
    terminal.sendText(command);
  }

  static async localSimulationUpdate(directory: TreeItem): Promise<void> {
    const tomcat = await DugConfig.selectTomcat();
    if (!tomcat) {
      return;
    }
    const directoryName = directory.label as string;
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Simulation Refresh', targetPath);
    terminal.sendText('mvn package');
    terminal.sendText(`cp ${targetPath}/target/*-SNAPSHOT.jar ${tomcat.catalinaHome}/webapps/${directoryName.substring(0, directoryName.indexOf('-'))}-simulation-web/WEB-INF/lib/`);
  }

  static async webpack(directory: TreeItem): Promise<void> {
    const tomcat = await DugConfig.selectTomcat();
    if (!tomcat) {
      return;
    }
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Webpack', targetPath);
    terminal.sendText('mvn frontend:webpack');
    terminal.sendText('mvn org.apache.maven.plugins:maven-antrun-plugin:1.3:run');
    if (workspace.workspaceFolders) {
      terminal.sendText(`rsync -ruv --delete ${workspace.workspaceFolders[0].uri.fsPath}/dug-cdn-web/src/main/webapp/ ${tomcat.catalinaHome}/webapps/dug-cdn-web/`);
    }
  }

  static async update(directory: TreeItem): Promise<void> {
    const tomcat = await DugConfig.selectTomcat();
    if (!tomcat) {
      return;
    }
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Maven Update', targetPath);
    terminal.sendText('mvn clean install -U');
    terminal.sendText(`rsync -ruv --delete ${targetPath}/target/${directory.label} ${tomcat.catalinaHome}/webapps/`);
  }

  static deploy(directory: TreeItem): void {
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Maven Deploy', targetPath);
    terminal.sendText('mvn deploy');
  }

  static install(directory: TreeItem): void {
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Maven Install', targetPath);
    terminal.sendText('mvn clean install -U');
  }

  static eclipse(directory: TreeItem): void {
    const targetPath = directory.resourceUri.fsPath;
    const terminal = ExtensionUtil.createDefaultTerminal('Maven Install', targetPath);
    terminal.sendText('mvn eclipse:clean');
    terminal.sendText('mvn eclipse:eclipse');
  }
}

export default Maven;
