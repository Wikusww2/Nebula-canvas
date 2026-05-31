export type BlockType = "TEXT" | "IMAGE";

export interface Project {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Canvas {
    id: string;
    projectId: string;
}

export interface Block {
    id: string;
    canvasId: string;
    type: BlockType;
    title: string;
    modelId: string;
    positionX: number;
    positionY: number;
    config: any; // Prisma.JsonValue
    outputRefId?: string;
    isStale: boolean;
}

export interface Connection {
    id: string;
    fromBlockId: string;
    toBlockId: string;
    kind: "TEXT_TO_TEXT" | "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE";
}

export interface Generation {
    id: string;
    blockId: string;
    modelId: string;
    createdAt: Date;
    payload: any;
    textOutput?: string;
    assetId?: string;
}

export interface Asset {
    id: string;
    kind: "IMAGE";
    mimeType: string;
    urlOrPath: string;
    width: number;
    height: number;
    meta: any;
}

export interface ModelConfig {
    id: string;
    provider: "openai" | "other";
    type: "text" | "image";
    displayName: string;
    defaultParams: Record<string, any>;
}
