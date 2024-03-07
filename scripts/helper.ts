export const ADDRESS_LENGTH = 42;

export enum ImplementationKind {
  DATA_REGISTRY,
  COLLECTION,
  DERIVED_ACCOUNT,
  ERC712A_COLLECTION,
  DATA_REGISTRY_V2,
  ADDONS_MANAGER,
  UPGRADE_ADDONS_MANAGER,
  UPDATE_ADDONS_STRATEGY,
}

export enum AddonsKind {
  FREE_MINT_WHITELIST_FCFS,
  FREE_MINT_WHITELIST_FIXED_TOKEN,
}