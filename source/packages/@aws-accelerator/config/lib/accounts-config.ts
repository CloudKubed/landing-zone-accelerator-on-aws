/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as t from './common-types';

/**
 * AWS Organizations configuration items.
 */
export class AccountsConfigTypes {
  /**
   *
   */
  static readonly accountConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    email: t.nonEmptyString,
    organizationalUnit: t.optional(t.nonEmptyString),
  });

  static readonly accountIdConfig = t.interface({
    email: t.nonEmptyString,
    accountId: t.nonEmptyString,
  });

  static readonly accountsConfig = t.interface({
    mandatoryAccounts: t.array(this.accountConfig),
    workloadAccounts: t.array(this.accountConfig),
    accountIds: t.optional(t.array(this.accountIdConfig)),
  });
}

export class AccountIdConfig implements t.TypeOf<typeof AccountsConfigTypes.accountIdConfig> {
  readonly email: string = '';
  readonly accountId: string = '';
}

export class AccountConfig implements t.TypeOf<typeof AccountsConfigTypes.accountConfig> {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
}
/**
 *
 */
export class AccountsConfig implements t.TypeOf<typeof AccountsConfigTypes.accountsConfig> {
  static readonly FILENAME = 'accounts-config.yaml';
  static readonly MANAGEMENT_ACCOUNT = 'Management';
  static readonly LOG_ARCHIVE_ACCOUNT = 'Log Archive';
  static readonly AUDIT_ACCOUNT = 'Audit';

  readonly mandatoryAccounts: AccountConfig[] = [
    {
      name: AccountsConfig.MANAGEMENT_ACCOUNT,
      description: 'The management (primary) account',
      email: '<management-account>@example.com <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Root',
    },
    {
      name: AccountsConfig.LOG_ARCHIVE_ACCOUNT,
      description: 'The log archive account',
      email: '<log-archive>@example.com  <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Security',
    },
    {
      name: AccountsConfig.AUDIT_ACCOUNT,
      description: 'The security audit account (also referred to as the audit account)',
      email: '<audit>@example.com  <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Security',
    },
  ];

  readonly workloadAccounts: AccountConfig[] = [];

  /**
   * Optionally provide a list of AWS Account IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  public accountIds: AccountIdConfig[] | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof AccountsConfigTypes.accountsConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): AccountsConfig {
    const buffer = fs.readFileSync(path.join(dir, AccountsConfig.FILENAME), 'utf8');
    const values = t.parse(AccountsConfigTypes.accountsConfig, yaml.load(buffer));
    return new AccountsConfig(values);
  }

  /**
   * Loads account ids by utilizing the organizations client if account ids are
   * not provided in the config.
   */
  public async loadAccountIds(): Promise<void> {
    if (this.accountIds === undefined) {
      this.accountIds = [];
    }
    if (this.accountIds.length == 0) {
      const organizationsClient = new OrganizationsClient({});
      for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
        page.Accounts?.forEach(item => {
          if (item.Email && item.Id) {
            this.accountIds?.push({ email: item.Email, accountId: item.Id });
          }
        });
      }
    }
  }

  public getAccountId(name: string): string {
    const email = this.getAccount(name).email;
    const accountId = this.accountIds?.find(item => item.email === email)?.accountId;
    if (accountId) {
      return accountId;
    }
    throw new Error(`name(${name}) not found`);
  }

  public getAccount(name: string): AccountConfig {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(value => value.name == name);
    if (value) {
      return value;
    }
    throw new Error(`Account not found for ${name}`);
  }

  public containsAccount(name: string): boolean {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(value => value.name == name);
    if (value) {
      return true;
    }

    return false;
  }

  public getManagementAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.MANAGEMENT_ACCOUNT);
  }

  public getLogArchiveAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.LOG_ARCHIVE_ACCOUNT);
  }

  public getAuditAccount(): AccountConfig {
    return this.getAccount(AccountsConfig.AUDIT_ACCOUNT);
  }

  public getManagementAccountId(): string {
    return this.getAccountId(AccountsConfig.MANAGEMENT_ACCOUNT);
  }

  public getLogArchiveAccountId(): string {
    return this.getAccountId(AccountsConfig.LOG_ARCHIVE_ACCOUNT);
  }

  public getAuditAccountId(): string {
    return this.getAccountId(AccountsConfig.AUDIT_ACCOUNT);
  }
}
