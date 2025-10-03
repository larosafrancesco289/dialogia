import {
  getAccessCookieDomain,
  getBraveSearchKey,
  getDeepResearchReasoningOnly,
  getDefaultZdrOnly,
  getPublicOpenRouterKey,
  getRoutePreferenceDefault,
  hasBraveKey,
  isOpenRouterProxyEnabled,
} from '@/lib/config';

export {
  getAccessCookieDomain,
  getBraveSearchKey,
  getDeepResearchReasoningOnly,
  getDefaultZdrOnly,
  getPublicOpenRouterKey,
  getRoutePreferenceDefault,
  hasBraveKey,
  isOpenRouterProxyEnabled,
} from '@/lib/config';

/** @deprecated use `isOpenRouterProxyEnabled` */
export const useOpenRouterProxy = () => isOpenRouterProxyEnabled();

/** @deprecated use `getDefaultZdrOnly` */
export const defaultZdrOnly = () => getDefaultZdrOnly();
