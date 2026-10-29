import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

/** Join dir + fileName rejecting path traversal (basename only). */
export function safeJoinFilename(directory: string, fileName: string): string {
    const base = path.basename(fileName ?? '');
    if (!base || base === '.' || base === '..') {
        throw new BadRequestException('Invalid file name');
    }

    const root = path.resolve(directory);
    const resolved = path.resolve(root, base);
    const relative = path.relative(root, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new BadRequestException('Invalid file name');
    }

    return resolved;
}
