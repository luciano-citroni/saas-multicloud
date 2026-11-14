import { Injectable } from '@nestjs/common';
import { OpenAiCompatibleFinopsAdapter } from './openai-compatible.adapter';

@Injectable()
export class GroqFinopsAdapter extends OpenAiCompatibleFinopsAdapter {
    constructor() {
        super('groq', 'https://api.groq.com/openai/v1', 'Groq');
    }
}
