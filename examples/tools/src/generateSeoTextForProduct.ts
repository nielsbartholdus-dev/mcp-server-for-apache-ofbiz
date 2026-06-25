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
                brandName: z.string().optional().describe('The brand name of the product.'),
                description: z.string().optional().describe('The short product description.'),
                originalText: z.string().optional().describe('The original product text used as input.'),
                generatedText: z.string().optional().describe('The generated SEO text.'),
                status: z.string().describe('Status of the SEO text generation.'),
                model: z.string().optional().describe('The local LLM model used for generation.'),
                productWeight: z.string().optional().describe('The product weight.'),
                weightUomId: z.string().optional().describe('The unit of the product weight.'),
                productHeight: z.string().optional().describe('The product height.'),
                heightUomId: z.string().optional().describe('The unit of the product height.'),
                productWidth: z.string().optional().describe('The product width.'),
                widthUomId: z.string().optional().describe('The unit of the product width.'),
                productDepth: z.string().optional().describe('The product depth.'),
                depthUomId: z.string().optional().describe('The unit of the product depth.'),
                quantityIncluded: z.string().optional().describe('The included quantity.'),
                quantityUomId: z.string().optional().describe('The unit of the included quantity.')
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
                    brandName: product.brandName || '',
                    description: product.description || '',
                    originalText: product.longDescription || '',
                    productWeight: String(product.productWeight || ''),
                    weightUomId: product.weightUomId || '',
                    productHeight: String(product.productHeight || ''),
                    heightUomId: product.heightUomId || '',
                    productWidth: String(product.productWidth || ''),
                    widthUomId: product.widthUomId || '',
                    productDepth: String(product.productDepth || ''),
                    depthUomId: product.depthUomId || '',
                    quantityIncluded: String(product.quantityIncluded || ''),
                    quantityUomId: product.quantityUomId || '',
                    status: 'product-data-loaded'
                }
                // Prompt
                const promptSeoInstruction = `
                Du bist Experte fuer sachliche B2B-Produkttexte.
                Erstelle einen kurzen SEO-optimierten Produkttext auf Deutsch.
                Der Text soll fachlich, verstaendlich und fuer gewerbliche Kunden geeignet sein.
                Nutze nur die bereitgestellten Produktinformationen.
                Erfinde keine zusaetzlichen Eigenschaften.
                Der Text soll 2 bis 3 Saetze lang sein.
                Nutze die angegebenen technischen Produktdaten wie Abmessungen, Gewicht und Verkaufseinheit gezielt, um den Produktnutzen sachlich und nachvollziehbar zu beschreiben.
                Nutze technische Angaben sachlich und leite daraus keinen Nutzen ab, der nicht klar aus den Produktdaten hervorgeht.
                `;

                const finalPrompt = `
                ${promptSeoInstruction}
                Produktname: ${mappedProductData.productName}
                Marke: ${mappedProductData.brandName}
                Kurzbeschreibung: ${mappedProductData.description}
                Langbeschreibung: ${mappedProductData.originalText}
                Gewicht: ${mappedProductData.productWeight} ${mappedProductData.weightUomId}
                Abmessungen: ${mappedProductData.productDepth} ${mappedProductData.depthUomId} x
                             ${mappedProductData.productWidth} ${mappedProductData.widthUomId} x
                             ${mappedProductData.productHeight} ${mappedProductData.heightUomId}
                Verkaufseinheit: ${mappedProductData.quantityIncluded} ${mappedProductData.quantityUomId}
                `;

                // lokales LLM aufrufen
                const llmUrl = 'http://localhost:11434/v1/chat/completions';
                //const llmModel = 'qwen2.5:3b';
                const llmModel = 'qwen3:8b';
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
                    brandName: mappedProductData.brandName,
                    description: mappedProductData.description,
                    originalText: mappedProductData.originalText,
                    generatedText: generatedText,
                    status: 'success',
                    model: llmModel,
                    productWeight: mappedProductData.productWeight,
                    weightUomId: mappedProductData.weightUomId,
                    productHeight: mappedProductData.productHeight,
                    heightUomId: mappedProductData.heightUomId,
                    productWidth: mappedProductData.productWidth,
                    widthUomId: mappedProductData.widthUomId,
                    productDepth: mappedProductData.productDepth,
                    depthUomId: mappedProductData.depthUomId,
                    quantityIncluded: mappedProductData.quantityIncluded,
                    quantityUomId: mappedProductData.quantityUomId
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
