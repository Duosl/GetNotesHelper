#!/usr/bin/env node

/**
 * 配置测试脚本
 * 用于验证环境变量和API连接是否正常
 */

const https = require('https');

// 配置信息
const config = {
  getNotesToken: process.env.GET_NOTES_TOKEN,
  getNotesBaseUrl: 'https://get-notes.luojilab.com',
  feishu: {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    appToken: process.env.FEISHU_APP_TOKEN,
    tableId: process.env.FEISHU_TABLE_ID,
  }
};

/**
 * 发送HTTP请求的工具函数
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData,
            ok: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            ok: res.statusCode >= 200 && res.statusCode < 300
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * 测试GET笔记API连接
 */
async function testGetNotesApi() {
  console.log('🔍 测试GET笔记API连接...');
  
  if (!config.getNotesToken) {
    console.log('❌ GET_NOTES_TOKEN 未设置');
    return false;
  }

  try {
    const url = new URL(`${config.getNotesBaseUrl}/voicenotes/web/notes`);
    url.searchParams.append('limit', '1');

    const response = await makeRequest(url.toString(), {
      headers: {
        'Authorization': `Bearer ${config.getNotesToken}`,
      },
    });

    if (response.ok) {
      console.log('✅ GET笔记API连接成功');
      console.log(`   总笔记数: ${response.data.c?.total_items || 0}`);
      return true;
    } else {
      console.log('❌ GET笔记API连接失败');
      console.log(`   状态码: ${response.status}`);
      console.log(`   错误信息: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ GET笔记API连接异常:', error.message);
    return false;
  }
}

/**
 * 测试飞书API连接
 */
async function testFeishuApi() {
  console.log('🔍 测试飞书API连接...');
  
  const requiredFields = ['appId', 'appSecret', 'appToken', 'tableId'];
  const missingFields = requiredFields.filter(field => !config.feishu[field]);
  
  if (missingFields.length > 0) {
    console.log('❌ 飞书配置不完整，缺少:', missingFields.join(', '));
    return false;
  }

  try {
    // 获取访问令牌
    const tokenResponse = await makeRequest('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      },
    });

    if (!tokenResponse.ok) {
      console.log('❌ 获取飞书访问令牌失败');
      console.log(`   状态码: ${tokenResponse.status}`);
      console.log(`   错误信息: ${JSON.stringify(tokenResponse.data)}`);
      return false;
    }

    const token = tokenResponse.data.tenant_access_token;
    console.log('✅ 飞书访问令牌获取成功');

    // 测试多维表格访问
    const tableUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records/search`;
    const tableResponse = await makeRequest(tableUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: {
        page_size: 1,
      },
    });

    if (tableResponse.ok) {
      console.log('✅ 飞书多维表格访问成功');
      console.log(`   表格记录数: ${tableResponse.data.data?.total || 0}`);
      return true;
    } else {
      console.log('❌ 飞书多维表格访问失败');
      console.log(`   状态码: ${tableResponse.status}`);
      console.log(`   错误信息: ${JSON.stringify(tableResponse.data)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ 飞书API连接异常:', error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('=== GET笔记同步配置测试 ===');
  console.log(`测试时间: ${new Date().toLocaleString()}\n`);
  
  let allTestsPassed = true;
  
  // 测试GET笔记API
  const getNotesResult = await testGetNotesApi();
  allTestsPassed = allTestsPassed && getNotesResult;
  
  console.log('');
  
  // 测试飞书API
  const feishuResult = await testFeishuApi();
  allTestsPassed = allTestsPassed && feishuResult;
  
  console.log('\n=== 测试结果 ===');
  if (allTestsPassed) {
    console.log('🎉 所有测试通过！配置正确，可以开始同步');
  } else {
    console.log('❌ 部分测试失败，请检查配置');
    process.exit(1);
  }
}

// 如果直接运行此脚本，则执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  main,
  testGetNotesApi,
  testFeishuApi,
};
