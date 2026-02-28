/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as accountsActions from "../accountsActions.js";
import type * as accountsHelpers from "../accountsHelpers.js";
import type * as aiCategorise from "../aiCategorise.js";
import type * as aiCategoriseHelpers from "../aiCategoriseHelpers.js";
import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as categorisingJobs from "../categorisingJobs.js";
import type * as clients from "../clients.js";
import type * as connectedAccounts from "../connectedAccounts.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as entityCrud from "../entityCrud.js";
import type * as files from "../files.js";
import type * as filing from "../filing.js";
import type * as filingActions from "../filingActions.js";
import type * as filingHelpers from "../filingHelpers.js";
import type * as http from "../http.js";
import type * as importHelpers from "../importHelpers.js";
import type * as importJobs from "../importJobs.js";
import type * as importPipeline from "../importPipeline.js";
import type * as invoiceActions from "../invoiceActions.js";
import type * as invoices from "../invoices.js";
import type * as lib_encryption from "../lib/encryption.js";
import type * as lib_providers_flutterwave from "../lib/providers/flutterwave.js";
import type * as lib_providers_mono from "../lib/providers/mono.js";
import type * as lib_providers_payoneer from "../lib/providers/payoneer.js";
import type * as lib_providers_paystack from "../lib/providers/paystack.js";
import type * as lib_providers_stitch from "../lib/providers/stitch.js";
import type * as lib_providers_transformer from "../lib/providers/transformer.js";
import type * as lib_providers_types from "../lib/providers/types.js";
import type * as lib_providers_wise from "../lib/providers/wise.js";
import type * as mutations from "../mutations.js";
import type * as notifications from "../notifications.js";
import type * as oauthStates from "../oauthStates.js";
import type * as onboarding from "../onboarding.js";
import type * as push from "../push.js";
import type * as pushTokens from "../pushTokens.js";
import type * as queries from "../queries.js";
import type * as reminders from "../reminders.js";
import type * as reportActions from "../reportActions.js";
import type * as reports from "../reports.js";
import type * as ruleBasedCategoriser from "../ruleBasedCategoriser.js";
import type * as tax from "../tax.js";
import type * as taxDeclarations from "../taxDeclarations.js";
import type * as taxEngine from "../taxEngine.js";
import type * as transactionActions from "../transactionActions.js";
import type * as transactions from "../transactions.js";
import type * as userCrud from "../userCrud.js";
import type * as userMutations from "../userMutations.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  accountsActions: typeof accountsActions;
  accountsHelpers: typeof accountsHelpers;
  aiCategorise: typeof aiCategorise;
  aiCategoriseHelpers: typeof aiCategoriseHelpers;
  auth: typeof auth;
  categories: typeof categories;
  categorisingJobs: typeof categorisingJobs;
  clients: typeof clients;
  connectedAccounts: typeof connectedAccounts;
  crons: typeof crons;
  dashboard: typeof dashboard;
  entityCrud: typeof entityCrud;
  files: typeof files;
  filing: typeof filing;
  filingActions: typeof filingActions;
  filingHelpers: typeof filingHelpers;
  http: typeof http;
  importHelpers: typeof importHelpers;
  importJobs: typeof importJobs;
  importPipeline: typeof importPipeline;
  invoiceActions: typeof invoiceActions;
  invoices: typeof invoices;
  "lib/encryption": typeof lib_encryption;
  "lib/providers/flutterwave": typeof lib_providers_flutterwave;
  "lib/providers/mono": typeof lib_providers_mono;
  "lib/providers/payoneer": typeof lib_providers_payoneer;
  "lib/providers/paystack": typeof lib_providers_paystack;
  "lib/providers/stitch": typeof lib_providers_stitch;
  "lib/providers/transformer": typeof lib_providers_transformer;
  "lib/providers/types": typeof lib_providers_types;
  "lib/providers/wise": typeof lib_providers_wise;
  mutations: typeof mutations;
  notifications: typeof notifications;
  oauthStates: typeof oauthStates;
  onboarding: typeof onboarding;
  push: typeof push;
  pushTokens: typeof pushTokens;
  queries: typeof queries;
  reminders: typeof reminders;
  reportActions: typeof reportActions;
  reports: typeof reports;
  ruleBasedCategoriser: typeof ruleBasedCategoriser;
  tax: typeof tax;
  taxDeclarations: typeof taxDeclarations;
  taxEngine: typeof taxEngine;
  transactionActions: typeof transactionActions;
  transactions: typeof transactions;
  userCrud: typeof userCrud;
  userMutations: typeof userMutations;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
