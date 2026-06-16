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
                longDescription: z.string().describe('The type identifier of the product.')
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
                    longDescription: product.longDescription || '',
                    status: 'product-data-loaded'
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(mappedProductData)
                        }
                    ],
                    structuredContent: mappedProductData
                };
            } catch (error) {
                console.error('Error loading product data:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error loading product data: ${error instanceof Error ? error.message : 'Unknown error'}`
                        }
                    ],
                    isError: true
                };
            }
        }
    }
}

