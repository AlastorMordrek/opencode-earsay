export declare function which(cmd: string): string | null;
export declare function spawnAsync(args: string[]): Promise<{
    ok: boolean;
    output: string;
}>;
export declare function readDir(dir: string): string[];
export declare function fileExists(path: string): boolean;
export declare function mkdir(dir: string): void;
export declare function removeFile(path: string): void;
export declare function removeDir(dir: string): void;
export declare function writeFile(path: string, content: string): void;
export declare function touch(path: string): void;
export declare function writeLog(msg: string): void;
//# sourceMappingURL=util.d.ts.map