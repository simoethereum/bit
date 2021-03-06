/** @flow */
import v4 from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import npmClient from '../npm-client';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import { ISOLATED_ENV_ROOT } from '../constants';
import { mkdirp } from '../utils';
import logger from '../logger/logger';
import { Consumer } from '../consumer';
import Component from '../consumer/component';

export default class Environment {
  path: string;
  scope: Scope;
  consumer: Consumer;

  constructor(scope: Scope, ciDir: string) {
    this.scope = scope;
    this.path = ciDir || path.join(scope.getPath(), ISOLATED_ENV_ROOT, v4());
    logger.debug(`creating a new isolated environment at ${this.path}`);
  }

  async create(): Promise<> {
    await mkdirp(this.path);
    this.consumer = await Consumer.createWithExistingScope(this.path, this.scope);
  }

  installNpmPackages(components: Component[], verbose: boolean): Promise<*> {
    return Promise.all(
      components.map((component) => {
        if (R.isEmpty(component.packageDependencies)) return Promise.resolve();
        return npmClient.install(component.packageDependencies, { cwd: component.writtenPath }, verbose);
      })
    );
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param rawId
   * @return {Promise.<Component>}
   */
  async importE2E(
    rawId: string,
    verbose: boolean,
    installDependencies: boolean = true,
    writeBitDependencies?: boolean = false,
    createNpmLinkFiles?: boolean = false
  ): Promise<ComponentWithDependencies> {
    const bitId = BitId.parse(rawId);
    const componentDependenciesArr = await this.scope.getMany([bitId]);
    await this.consumer.writeToComponentsDir({
      componentsWithDependencies: componentDependenciesArr,
      writeBitDependencies,
      createNpmLinkFiles
    });
    const componentWithDependencies: ComponentWithDependencies = R.head(componentDependenciesArr);
    const componentWithDependenciesFlatten = [
      componentWithDependencies.component,
      ...componentWithDependencies.dependencies
    ];
    if (installDependencies) await this.installNpmPackages(componentWithDependenciesFlatten, verbose);
    return componentWithDependencies;
  }

  getPath(): string {
    return this.path;
  }

  destroy(): Promise<*> {
    return new Promise((resolve, reject) => {
      fs.remove(this.path, (err) => {
        if (err) return reject(err);
        logger.debug(`destroying the isolated environment at ${this.path}`);
        return resolve();
      });
    });
  }
}
