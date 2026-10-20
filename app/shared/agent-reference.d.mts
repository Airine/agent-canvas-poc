export interface IdentitySource { workspaceId: string; nodeId: string; title: string }
export interface DisplayIdentity { nickname: string; suffix: string; displayTitle: string; referenceHash: string; reference: string }
export declare function identityHash(value: string): string;
export declare function sessionIdentities(sources: readonly IdentitySource[], workspaceId: string, hash?: (value: string) => string): Map<string, DisplayIdentity>;
export declare function resolveAgentReference(sources: readonly IdentitySource[], workspaceId: string, reference: string): string;
