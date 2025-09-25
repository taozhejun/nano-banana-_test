
import type { GeneratedContent } from '../types';

/**
 * OpenRouter API 配置
 * 使用 OpenRouter 的 Google Gemini 2.5 Flash Image Preview 模型
 * 
 * 支持多种环境变量配置方式：
 * 1. VITE_API_KEY (推荐，Vite 标准方式)
 * 2. OPENROUTER_API_KEY (通过 vite.config.ts 映射)
 * 3. process.env.API_KEY (通过 vite.config.ts 映射，兼容性)
 */

// 尝试多种环境变量获取方式
const API_KEY = import.meta.env.VITE_API_KEY || 
                (typeof process !== 'undefined' && process.env?.API_KEY);

if (!API_KEY) {
  throw new Error(
    "API 密钥未设置。请在项目根目录创建 .env 文件并添加：\n" +
    "VITE_API_KEY=your_openrouter_api_key\n\n" +
    "或者设置环境变量 OPENROUTER_API_KEY。\n" +
    "获取 OpenRouter API 密钥：https://openrouter.ai"
  );
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'google/gemini-2.5-flash-image-preview';

/**
 * 使用 OpenRouter API 编辑图像
 * @param base64ImageData - Base64 编码的图像数据
 * @param mimeType - 图像的 MIME 类型
 * @param prompt - 编辑提示
 * @param maskBase64 - 蒙版图像的 Base64 数据（可选）
 * @param secondaryImage - 第二张图像（可选）
 * @returns 生成的内容
 */
export async function editImage(
    base64ImageData: string, 
    mimeType: string, 
    prompt: string,
    maskBase64: string | null,
    secondaryImage: { base64: string; mimeType: string } | null
): Promise<GeneratedContent> {
  try {
    let fullPrompt = prompt;
    
    // 构建消息内容数组
    const messageContent: any[] = [];
    
    // 添加主图像
    messageContent.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64ImageData}`
      }
    });

    // 如果有蒙版，添加蒙版并修改提示
    if (maskBase64) {
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${maskBase64}`
        }
      });
      fullPrompt = `Apply the following instruction only to the masked area of the image: "${prompt}". Preserve the unmasked area.`;
    }
    
    // 如果有第二张图像，添加它
    if (secondaryImage) {
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:${secondaryImage.mimeType};base64,${secondaryImage.base64}`
        }
      });
    }

    // 添加文本提示，明确要求图像输出
    const enhancedPrompt = fullPrompt + " Please generate and return an image as output.";
    messageContent.push({
      type: "text",
      text: enhancedPrompt
    });

    // 构建 OpenRouter API 请求体
    // Gemini 2.5 Flash Image Preview (Nano Banana) 支持图像生成功能
    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 4096,
      temperature: 0.7
      // 注意：移除了 response_format，让模型自动决定输出格式
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Nano Bananary Image Editor'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // 调试：打印完整的 API 响应（开发阶段）
    console.log('OpenRouter API Response:', JSON.stringify(data, null, 2));
    console.log('Request body was:', JSON.stringify(requestBody, null, 2));
    
    const result: GeneratedContent = { imageUrl: null, text: null };
    
    // 获取模型响应内容
    const responseContent = data.choices?.[0]?.message?.content;
    
    if (responseContent) {
      console.log('Response content type:', typeof responseContent);
      console.log('Response content preview:', responseContent?.substring?.(0, 200) + '...');
      
      // 检查多种可能的 base64 图像格式
      let base64ImageMatch = null;
      
      // 标准 data URI 格式
      base64ImageMatch = responseContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      
      if (!base64ImageMatch) {
        // 检查纯 base64 数据（可能没有 data URI 前缀）
        const base64Pattern = /^[A-Za-z0-9+/]{100,}={0,2}$/;
        if (typeof responseContent === 'string' && base64Pattern.test(responseContent.trim())) {
          // 假设是 PNG 格式的 base64 数据
          result.imageUrl = `data:image/png;base64,${responseContent.trim()}`;
          console.log('Found raw base64 data, converted to data URI');
        }
      } else {
        result.imageUrl = base64ImageMatch[0];
        console.log('Found standard data URI format');
      }
      
      // 保存文本内容（如果有的话）
      if (typeof responseContent === 'string' && !result.imageUrl) {
        result.text = responseContent;
      }
    }

    // 检查 OpenRouter 可能的其他响应格式
    if (!result.imageUrl && data.choices?.[0]?.message) {
      const message = data.choices[0].message;
      console.log('Checking message for alternative image formats...');
      
      // 首先检查新的 images 数组格式（根据控制台日志）
      if (message.images && Array.isArray(message.images)) {
        console.log('Found images array:', message.images);
        for (const image of message.images) {
          if (image.type === 'image_url' && image.image_url?.url) {
            result.imageUrl = image.image_url.url;
            console.log('Found image in message.images array');
            break;
          }
        }
      }
      
      // 检查是否有图像附件或特殊格式
      if (!result.imageUrl && message.attachments) {
        console.log('Found attachments:', message.attachments);
        const imageAttachment = message.attachments.find((att: any) => 
          att.type === 'image' || att.content_type?.startsWith('image/')
        );
        if (imageAttachment?.url) {
          result.imageUrl = imageAttachment.url;
          console.log('Found image in attachments');
        }
      }
      
      // 检查消息中是否直接包含图像URL
      if (!result.imageUrl && message.image_url) {
        result.imageUrl = message.image_url;
        console.log('Found direct image URL');
      }
      
      // 检查是否有 content 数组格式（类似 OpenAI）
      if (!result.imageUrl && Array.isArray(message.content)) {
        console.log('Found content array format');
        for (const item of message.content) {
          if (item.type === 'image_url' && item.image_url?.url) {
            result.imageUrl = item.image_url.url;
            console.log('Found image in content array');
            break;
          }
        }
      }
    }

    // 如果仍然没有图像，提供有用的错误信息
    if (!result.imageUrl) {
      let errorMessage = "Gemini 2.5 Flash Image Preview 模型没有返回图像。\n\n";
      
      if (result.text) {
        errorMessage += `模型响应：${result.text}\n\n`;
      }
      
      errorMessage += "可能的原因：\n" +
        "• 提示词可能被安全过滤器阻止\n" +
        "• 输入图像格式或内容不符合要求\n" +
        "• API 响应格式发生变化\n" +
        "• 模型暂时不可用\n\n" +
        "建议尝试：\n" +
        "• 修改提示词，避免敏感内容\n" +
        "• 使用不同的输入图像\n" +
        "• 稍后重试";
      
      throw new Error(errorMessage);
    }

    return result;

  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    if (error instanceof Error) {
      let errorMessage = error.message;
      
      // 处理网络错误
      if (errorMessage.includes('fetch')) {
        errorMessage = "Network error occurred. Please check your internet connection and try again.";
      }
      
      throw new Error(errorMessage);
    }
    throw new Error("An unknown error occurred while communicating with the API.");
  }
}

/**
 * 视频生成功能
 * 注意：OpenRouter 的 Gemini 2.5 Flash Image Preview 模型不支持视频生成
 * @param prompt - 视频生成提示
 * @param image - 可选的参考图像
 * @param aspectRatio - 视频宽高比
 * @param onProgress - 进度回调函数
 * @throws Error - 抛出不支持的功能错误
 */
export async function generateVideo(
    prompt: string,
    image: { base64: string; mimeType: string } | null,
    aspectRatio: '16:9' | '9:16',
    onProgress: (message: string) => void
): Promise<string> {
    onProgress("Checking video generation capabilities...");
    
    // OpenRouter 的 Gemini 模型不支持视频生成
    throw new Error(
        "视频生成功能暂时不可用。当前使用的 OpenRouter Gemini 2.5 Flash Image Preview 模型仅支持图像处理功能。" +
        "请选择其他图像变换效果，或联系开发者了解视频生成替代方案。"
    );
}
