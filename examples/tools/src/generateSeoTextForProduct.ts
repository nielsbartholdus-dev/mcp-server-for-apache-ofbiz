import { z } from 'zod';
import type express from 'express';

import type { ServerConfig, ToolDefinition } from 'mcp-server-for-apache-ofbiz/config';

export default function(serverConfig: ServerConfig): ToolDefinition {
    return {
        name: 'generateSeoTextForProduct',
        metadata: {
            title: 'Generate SEO text for product',
            description: 'Generates an SEO optimized text for a product by using its product ID.',
            inputSchema: {
                productId: z
                    .string()
                    .min(2)
                    .max(20)
                    .describe('ID of the product for which an SEO text should be generated.')
            },
            outputSchema: {
                productId: z.string().describe('The unique identifier of the product.'),
                productName: z.string().optional().describe('The name of the product.'),
                originalText: z.string().optional().describe('The original product text used as input.'),
                generatedText: z.string().optional().describe('The generated SEO text.'),
                status: z.string().describe('Status of the SEO text generation.'),
            }
        },
        handler: async ({ productId }: { productId: string }, request: express.Request) => {
            const idParam = { idToFind: productId };
            const inParams = encodeURIComponent(JSON.stringify(idParam));
            const backendUrl = `${serverConfig.BACKEND_API_BASE}/rest/services/findProductByIdMcp?inParams=${inParams}`;

            const requestOptions: { method: string; headers: Record<string, string> } = {
                method: 'GET',
                headers: {
                    'User-Agent': serverConfig.BACKEND_USER_AGENT || '',
                    Accept: 'application/json'
                }
            };

            if ((request as any).authInfo?.downstreamToken) {
                requestOptions.headers['Authorization'] =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    `Bearer ${(request as any).authInfo.downstreamToken}`;
            }

            try {
                const response = await fetch(backendUrl, requestOptions);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const rawProductResponse = await response.json();

                // mapping
                const product = rawProductResponse.data.product;

                if (!product) {
                    throw new Error('Product not found in REST response');
                }

                const mappedProductData = {
                    productId: product.productId || '',
                    productName: product.productName || '',
                    originalText: product.longDescription || '',
                    status: 'product-data-loaded'
                }
                // Prompt
                const promptSeoInstruction = `
                Du bist Experte im Schreiben von SEO-optimierten Produkttexten.
                Du erhälst Produktinformationen zu einem Produkt.
                Erstelle daraus einen kurzen SEO-optimierten Produkttext für einen Onlineshop.
                Der Text soll 2 bis 3 Sätze lang sein.
                Nutze dafür nur die bereitgestellten Informationen.
                Erfinde keine zusätzlichen Eigenschaften.
                `;

                const finalPrompt = `
                ${promptSeoInstruction}
                Produktname:${mappedProductData.productName}
                Beschreibung:${mappedProductData.originalText}
                `;

                // lokales LLM aufrufen
                const llmUrl = 'http://localhost:11434/v1/chat/completions';
                const llmModel = 'qwen2.5:3b';
                const temperature = 0.2;

                const llmRequestBody = {
                    model: llmModel,
                    messages: [
                        {
                            role: 'user',
                            content: finalPrompt
                        }

                    ],
                    temperature,
                    stream: false
                }

                const llmRequestOptions: { method: string; headers: Record<string, string>; body: string } = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify(llmRequestBody)
                };

                const llmResponse = await fetch(llmUrl, llmRequestOptions);

                if (!llmResponse.ok) {
                    throw new Error(`LLM request failed with status: ${llmResponse.status}`);
                }

                const llmResponseJson = await llmResponse.json();

                const generatedText = llmResponseJson.choices[0].message.content.trim();

                if (!generatedText) {
                    throw new Error('No generated text found in LLM response');
                }

                const toolResponse = {
                    productId: mappedProductData.productId,
                    productName: mappedProductData.productName,
                    originalText: mappedProductData.originalText,
                    generatedText: generatedText,
                    status: 'success',
                    model: llmModel
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(toolResponse)
                        }
                    ],
                    structuredContent: toolResponse
                };
            } catch (error) {
                console.error('Error generating SEO text:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error generating SEO text: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    }
}
