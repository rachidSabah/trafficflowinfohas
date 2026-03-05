import { NextResponse, NextRequest } from "next/server";
import ZAI from 'z-ai-web-dev-sdk';

/**
 * AI Content Generator API
 * 
 * Uses z-ai-web-dev-sdk for real AI content generation
 * Generates unique content based on topic, type, and tone
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, type, tone } = body;

    console.log('Content generation request:', { topic, type, tone });

    if (!topic) {
      return NextResponse.json({ 
        error: 'Topic is required',
        success: false 
      }, { status: 400 });
    }

    const contentType = type || 'blog';
    const contentTone = tone || 'professional';

    // Build content-specific prompts
    const typePrompts: Record<string, { instruction: string; format: string; length: string }> = {
      blog: {
        instruction: 'Write a comprehensive, SEO-optimized blog post',
        format: 'Use markdown formatting with H1, H2, H3 headings. Include an introduction, 3-5 main sections with subsections, and a conclusion.',
        length: '800-1200 words'
      },
      product: {
        instruction: 'Write a compelling, conversion-focused product description',
        format: 'Include a catchy headline, key features as bullet points, benefits, social proof elements, and a strong call-to-action.',
        length: '150-300 words'
      },
      landing: {
        instruction: 'Write high-converting landing page copy',
        format: 'Include a powerful headline, value proposition, key benefits, feature highlights, testimonials placeholder, and multiple CTAs.',
        length: '300-500 words'
      },
      meta: {
        instruction: 'Write a SEO meta description',
        format: 'Single paragraph, no headings. Make it compelling to encourage clicks.',
        length: 'under 160 characters total'
      },
      social: {
        instruction: 'Write an engaging social media post',
        format: 'Use emojis, hashtags, and a conversational style. Include a hook, value proposition, and call-to-action.',
        length: 'under 280 characters for Twitter, can be longer for other platforms'
      }
    };

    const toneInstructions: Record<string, string> = {
      professional: 'Use a professional, authoritative tone suitable for business audiences. Be clear, concise, and credible.',
      casual: 'Use a casual, friendly, conversational tone. Write like you are talking to a friend.',
      technical: 'Use a technical, detailed tone with industry-specific terminology. Be precise and comprehensive.',
      friendly: 'Use a warm, approachable, and encouraging tone. Be supportive and positive.'
    };

    const typeConfig = typePrompts[contentType];
    
    const systemPrompt = `You are an expert SEO content writer with 10+ years of experience. Create high-quality, engaging content that ranks well in search engines and converts readers. 

Your content is always:
- Well-structured and easy to read
- Original and provides real value
- Optimized for search engines
- Tailored to the specified tone and format
- Actionable and practical

You never repeat generic phrases or use filler content. Every sentence serves a purpose.`;

    const userPrompt = `${typeConfig.instruction} about "${topic}".

TONE: ${toneInstructions[contentTone]}

FORMAT: ${typeConfig.format}

LENGTH: ${typeConfig.length}

ADDITIONAL REQUIREMENTS:
- Make the content completely unique and specific to "${topic}"
- Include specific examples, statistics, or case studies where appropriate
- Ensure all advice is actionable and practical
- Use natural language that appeals to both readers and search engines
- Avoid generic phrases like "in today's digital landscape" or "it goes without saying"
- Make the opening sentence compelling and hook the reader immediately
- End with a strong call-to-action or memorable conclusion

Generate the content now:`;

    let content = '';
    let method = 'ai';
    let aiError = null;

    try {
      console.log('Initializing ZAI SDK...');
      const zai = await ZAI.create();
      console.log('ZAI SDK initialized successfully');

      const maxTokens = contentType === 'meta' ? 100 : contentType === 'social' ? 300 : 2000;

      console.log('Calling AI completion...');
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: maxTokens
      });

      console.log('AI completion received:', completion ? 'success' : 'failed');
      
      content = completion.choices?.[0]?.message?.content || '';
      console.log('Content length:', content.length);
      
      if (!content || content.length < 20) {
        throw new Error('AI returned insufficient content: ' + content.substring(0, 100));
      }
      
    } catch (err: any) {
      aiError = err?.message || 'Unknown error';
      console.error('AI generation error:', aiError);
      
      // Generate topic-specific fallback
      content = generateTopicSpecificContent(topic, contentType, contentTone);
      method = 'template';
    }
    
    return NextResponse.json({ 
      success: true, 
      content,
      type: contentType,
      topic,
      generatedAt: new Date().toISOString(),
      method,
      wordCount: content.split(/\s+/).length,
      ...(aiError ? { note: 'Used fallback due to: ' + aiError } : {})
    });
  } catch (error: any) {
    console.error('API Error:', error);
    
    return NextResponse.json({ 
      error: 'Failed to generate content',
      message: error.message,
      success: false
    }, { status: 500 });
  }
}

// Generate truly topic-specific content
function generateTopicSpecificContent(topic: string, type: string, tone: string): string {
  const mainKeyword = topic.split(' ')[0];
  const topicHash = topic.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  
  // Topic-specific content based on common themes
  const isTechTopic = /tech|software|app|digital|ai|code|data|web|cloud/i.test(topic);
  const isBusinessTopic = /business|marketing|sales|revenue|growth|strategy/i.test(topic);
  const isHealthTopic = /health|fitness|wellness|medical|diet|exercise/i.test(topic);
  const isFinanceTopic = /money|finance|invest|crypto|stock|trading|budget/i.test(topic);
  
  let specificContent = '';
  
  if (type === 'blog') {
    specificContent = generateBlogContent(topic, tone, { isTechTopic, isBusinessTopic, isHealthTopic, isFinanceTopic });
  } else if (type === 'product') {
    specificContent = generateProductContent(topic, tone, { isTechTopic, isBusinessTopic });
  } else if (type === 'landing') {
    specificContent = generateLandingContent(topic, tone);
  } else if (type === 'meta') {
    specificContent = `${topic}: Expert guide with proven strategies. Discover actionable tips and best practices for ${topic.toLowerCase()}. Start improving today!`;
  } else if (type === 'social') {
    specificContent = `🚀 ${topic} — The Ultimate Guide!

Ready to master ${topic}? Here's what you need to know:

✅ Proven strategies that work
✅ Step-by-step implementation  
✅ Real, measurable results

Don't miss out! 👇

#${mainKeyword.replace(/[^a-zA-Z0-9]/g, '')} #Tips #Success #Growth`;
  }
  
  return specificContent;
}

function generateBlogContent(topic: string, tone: string, context: any): string {
  const { isTechTopic, isBusinessTopic, isHealthTopic, isFinanceTopic } = context;
  
  let intro = '';
  let sections = '';
  
  // Generate topic-specific intro
  if (isTechTopic) {
    intro = `The technology landscape is evolving rapidly, and ${topic} has emerged as a game-changer for organizations worldwide. Whether you're a developer, product manager, or tech leader, understanding ${topic} is crucial for staying ahead of the curve.`;
    sections = `
## The Technical Foundation of ${topic}

At its core, ${topic} leverages cutting-edge technologies to solve complex problems. The architecture typically involves:

- **Scalable Infrastructure**: Cloud-native design patterns that adapt to demand
- **Modern APIs**: RESTful or GraphQL interfaces for seamless integration
- **Data Pipeline**: Real-time processing and analytics capabilities

## Implementation Architecture

When implementing ${topic}, consider these technical requirements:

\`\`\`
Key Components:
├── Core Engine
├── Data Layer
├── API Gateway
└── Client Interface
\`\`\`

### Best Practices for Developers

1. **Start with a clear architecture diagram** before writing any code
2. **Use version control** from day one
3. **Implement proper error handling** and logging
4. **Write comprehensive tests** for all components

## Common Technical Challenges

| Challenge | Solution |
|-----------|----------|
| Scalability | Implement horizontal scaling patterns |
| Security | Use encryption and authentication layers |
| Performance | Optimize database queries and caching |
| Integration | Design flexible API contracts |`;
  } else if (isBusinessTopic) {
    intro = `In the competitive business landscape, ${topic} has become a critical differentiator between market leaders and followers. Companies that master ${topic} consistently outperform their competitors and achieve sustainable growth.`;
    sections = `
## Why ${topic} Drives Business Success

Research shows that businesses implementing effective ${topic} strategies see:

- 47% higher revenue growth
- 32% improvement in customer retention
- 28% reduction in operational costs
- 3x faster time-to-market

## Strategic Framework for ${topic}

### Phase 1: Assessment
Evaluate your current ${topic} maturity level and identify gaps.

### Phase 2: Planning
Develop a roadmap with clear milestones and KPIs.

### Phase 3: Execution
Implement with dedicated resources and executive sponsorship.

### Phase 4: Optimization
Continuously refine based on performance data.

## ROI Calculation

To measure ${topic} success, track these metrics:

1. **Cost Savings**: Calculate efficiency gains
2. **Revenue Impact**: Measure attributable growth
3. **Time Savings**: Quantify productivity improvements
4. **Quality Metrics**: Track error rates and satisfaction`;
  } else if (isHealthTopic) {
    intro = `When it comes to ${topic}, evidence-based approaches make all the difference. Understanding the science and practical applications can transform your health outcomes and overall wellbeing.`;
    sections = `
## The Science Behind ${topic}

Research published in leading journals demonstrates that ${topic}:

- Improves key health markers by 25-40%
- Reduces risk factors associated with chronic conditions
- Enhances overall quality of life metrics

## Practical Implementation

### Getting Started with ${topic}

1. **Consult a Professional**: Always start with expert guidance
2. **Set Realistic Goals**: Progressive improvement over quick fixes
3. **Track Your Progress**: Use measurable indicators

### Daily Protocol

Morning: Establish baseline routines
Afternoon: Maintain consistency
Evening: Track and reflect

## Common Questions About ${topic}

**Q: How long until I see results?**
A: Most people notice changes within 2-4 weeks of consistent practice.

**Q: Are there any risks?**
A: When done correctly, ${topic} is generally safe. Consult your healthcare provider.

**Q: What equipment do I need?**
A: Start with basics and add tools as you advance.`;
  } else if (isFinanceTopic) {
    intro = `Financial success with ${topic} requires understanding both the fundamentals and advanced strategies. Whether you're a beginner or experienced, this guide will help you make informed decisions about ${topic}.`;
    sections = `
## Understanding ${topic} Fundamentals

Before diving into ${topic}, grasp these core concepts:

- **Risk vs. Reward**: Higher potential returns come with increased risk
- **Time Horizon**: Your strategy should match your timeline
- **Diversification**: Never put all eggs in one basket

## ${topic} Strategy Framework

### Conservative Approach
Lower risk, steady returns over time

### Moderate Approach
Balanced risk-reward for medium-term goals

### Aggressive Approach
Higher risk tolerance for maximum growth potential

## Key Metrics to Track

| Metric | Target | Your Current |
|--------|--------|--------------|
| Return Rate | 8-12% | ___% |
| Risk Score | <5 | ___ |
| Allocation | Balanced | ___ |

## Warning Signs to Avoid

🚩 Promises of guaranteed returns
🚩 Pressure to act immediately
🚩 Lack of transparency in fees
🚩 No clear exit strategy`;
  } else {
    intro = `${topic} has become an essential topic for anyone looking to improve their knowledge and achieve better results. This comprehensive guide will walk you through everything you need to know.`;
    sections = `
## Understanding ${topic}

The fundamentals of ${topic} include:

- Core principles and concepts
- Practical applications
- Common challenges and solutions

## How to Get Started with ${topic}

### Step 1: Learn the Basics
Build a strong foundation in ${topic} fundamentals.

### Step 2: Practice Consistently
Regular application leads to mastery.

### Step 3: Seek Feedback
Learn from experts and peers.

### Step 4: Iterate and Improve
Continuous improvement is key.

## Tips for Success

✅ Start small and build up
✅ Document your progress
✅ Connect with others in the field
✅ Stay updated on developments`;
  }
  
  // Tone-specific closings
  const closings: Record<string, string> = {
    professional: `## Conclusion

${topic} represents a significant opportunity for those willing to invest the time to master it. By following the strategies outlined in this guide and maintaining consistency, you'll be well-positioned to achieve your goals.

The key takeaway? Start with a solid foundation, implement systematically, and continuously optimize based on results.`,
    casual: `## Wrapping Up

So there you have it — everything you need to know about ${topic}! The key is to just get started and keep going. Don't overthink it.

Got questions? Drop them in the comments below! 👇`,
    technical: `## Technical Summary

Key implementation points for ${topic}:

1. Architecture must support scalability
2. Security considerations from day one
3. Performance monitoring essential
4. Documentation and testing non-negotiable

For advanced implementations, consider consulting domain experts.`,
    friendly: `## Final Thoughts

I hope this guide to ${topic} has been helpful! Remember, everyone starts somewhere, and you're already on the right path by learning.

Feel free to reach out if you have any questions — I'm here to help! 😊`
  };
  
  return `# ${topic}: The Complete Guide

${intro}
${sections}

${closings[tone] || closings.professional}

---
*Generated for: ${topic}*`;
}

function generateProductContent(topic: string, tone: string, context: any): string {
  const { isTechTopic, isBusinessTopic } = context;
  
  return `# ${topic}

## Transform Your Results with ${topic}

${tone === 'casual' ? "Looking for a solution that actually works?" : "Our premium offering delivers exceptional value for professionals seeking results."}

### What Makes ${topic} Different

✅ **Proven Methodology** — Tested across 500+ implementations  
✅ **Expert Support** — Guidance when you need it  
✅ **Measurable Results** — Track your progress  
✅ **Regular Updates** — Stay current with improvements

### Features

- Complete ${topic} framework
- Step-by-step implementation guide
- Templates and resources
- Progress tracking dashboard

### What's Included

📦 ${topic} Core System  
📦 Implementation Templates  
📦 Training Materials  
📦 Priority Support Access

### Pricing

| Plan | Features | Price |
|------|----------|-------|
| Starter | Basic ${topic} tools | $49/mo |
| Professional | Full suite + support | $99/mo |
| Enterprise | Custom + dedicated | Contact us |

### Customer Results

> "Implemented ${topic} in 2 weeks and saw 40% improvement." — Early Adopter

**[Start Free Trial] [Schedule Demo] [Contact Sales]**`;
}

function generateLandingContent(topic: string, tone: string): string {
  return `# Master ${topic} Today

${tone === 'casual' ? "Ready to finally get results with" : "The complete solution for professionals seeking excellence in"} ${topic}.

---

## The Problem

❌ Information overload  
❌ No clear path forward  
❌ Wasted time and money  
❌ Frustrating trial and error

---

## The Solution

### ✅ Proven ${topic} Framework
A step-by-step system that works.

### ✅ Expert Implementation
Learn from practitioners who've mastered ${topic}.

### ✅ Real, Measurable Results
Join thousands achieving their ${topic} goals.

---

## How It Works

| Step | Action | Result |
|------|--------|--------|
| 1 | Assess | Know your starting point |
| 2 | Plan | Get your custom roadmap |
| 3 | Implement | Execute with guidance |
| 4 | Optimize | Refine for best results |

---

## What You Get

✓ Complete ${topic} system  
✓ Templates and checklists  
✓ Expert community access  
✓ Lifetime updates

---

## Pricing

**$97** — One-time payment  
*30-day money-back guarantee*

---

## Ready to Transform Your ${topic}?

**[Get Instant Access]**

*Join 2,000+ professionals who've mastered ${topic}*`;
}

export async function GET() {
  return NextResponse.json({ 
    message: "TrafficFlow AI Content Generator API",
    version: "3.1",
    status: "active",
    usingSDK: "z-ai-web-dev-sdk",
    endpoints: {
      POST: "/api/generate-content - Generate unique AI content"
    },
    contentTypes: ['blog', 'product', 'landing', 'meta', 'social'],
    tones: ['professional', 'casual', 'technical', 'friendly']
  });
}
