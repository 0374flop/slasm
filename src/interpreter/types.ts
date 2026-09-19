export type label = {
    ip: number;
    name: string;
}

export type comment = {
    ip: number;
    text: string;
}

export type ParseResult = {
    instructions: string[];
    labels: label[];
    comments: comment[];
}
