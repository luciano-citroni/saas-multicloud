import { Injectable } from '@nestjs/common';
import { OpenAiCompatibleFinopsAdapter } from './openai-compatible.adapter';

@Injectable()
export class DeepSeekFinopsAdapter extends OpenAiCompatibleFinopsAdapter {
    constructor() {
        super('deepseek', 'https://api.deepseek.com', 'DeepSeek');
    }
}
