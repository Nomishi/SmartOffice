package com.smartoffice.backend.ai;

/** Cổng gọi nhà cung cấp AI; có thể thay bằng mock/local provider. */
public interface AiClient {

    /**
     * @param systemPrompt hướng dẫn vai trò/giới hạn
     * @param userPrompt   dữ liệu context + câu hỏi
     * @return nội dung trả lời
     */
    String complete(String systemPrompt, String userPrompt);
}
