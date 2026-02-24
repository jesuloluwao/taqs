/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as dashboard from "../dashboard.js";
import type * as entityCrud from "../entityCrud.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as mutations from "../mutations.js";
import type * as onboarding from "../onboarding.js";
import type * as queries from "../queries.js";
import type * as userCrud from "../userCrud.js";
import type * as userMutations from "../userMutations.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  categories: typeof categories;
  dashboard: typeof dashboard;
  entityCrud: typeof entityCrud;
  files: typeof files;
  http: typeof http;
  mutations: typeof mutations;
  onboarding: typeof onboarding;
  queries: typeof queries;
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
