#!/usr/bin/env node

/**
 * GET笔记同步到飞书多维表格的独立脚本
 * 用于GitHub Actions自动化执行
 */

const https = require('https');

// 配置信息
const config = {
  // GET笔记API配置
  getNotesToken: process.env.GET_NOTES_TOKEN,
  getNotesBaseUrl: 'https://get-notes.luojilab.com',
  
  // 飞书配置
  feishu: {
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    appToken: process.env.FEISHU_APP_TOKEN,
    tableId: process.env.FEISHU_TABLE_ID,
  }
};

// 飞书API端点
const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';
const feishuApi = {
  AUTH_TENANT_TOKEN: `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`,
  BATCH_CREATE_RECORDS: `${FEISHU_BASE_URL}/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records/batch_create`,
  QUERY_RECORDS: `${FEISHU_BASE_URL}/bitable/v1/apps/${config.feishu.appToken}/tables/${config.feishu.tableId}/records/search`,
};

// 全局变量
let feishuToken = '';
let feishuTokenExpireTime = 0;
let importedNoteIds = [];

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
 * 获取飞书访问令牌
 */
async function getFeishuToken() {
  // 检查token是否过期
  if (feishuToken && Date.now() < feishuTokenExpireTime) {
    return feishuToken;
  }

  console.log('获取飞书访问令牌...');
  
  try {
    const response = await makeRequest(feishuApi.AUTH_TENANT_TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        app_id: config.feishu.appId,
        app_secret: config.feishu.appSecret,
      },
    });

    if (!response.ok) {
      throw new Error(`获取飞书令牌失败: ${response.status} ${JSON.stringify(response.data)}`);
    }

    feishuToken = response.data.tenant_access_token;
    feishuTokenExpireTime = Date.now() + (response.data.expire - 300) * 1000; // 提前5分钟过期
    
    console.log('飞书访问令牌获取成功');
    return feishuToken;
  } catch (error) {
    console.error('获取飞书访问令牌失败:', error);
    throw error;
  }
}

/**
 * 获取GET笔记列表
 */
async function getNotesFromGet(limit = 100, sinceId = '', sort = 'create_desc') {
  const url = new URL(`${config.getNotesBaseUrl}/voicenotes/web/notes`);
  url.searchParams.append('limit', limit.toString());
  if (sinceId) url.searchParams.append('since_id', sinceId);
  url.searchParams.append('sort', sort);

  console.log(`获取GET笔记: limit=${limit}, sinceId=${sinceId}`);

  try {
    const response = await makeRequest(url.toString(), {
      headers: {
        'Authorization': `Bearer ${config.getNotesToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`获取GET笔记失败: ${response.status} ${JSON.stringify(response.data)}`);
    }

    return {
      list: response.data.c.list,
      total_count: response.data.c.total_items,
      has_more: response.data.c.has_more,
    };
  } catch (error) {
    console.error('获取GET笔记失败:', error);
    throw error;
  }
}

/**
 * 获取所有GET笔记
 */
async function getAllNotesFromGet() {
  console.log('开始获取所有GET笔记...');
  
  let allNotes = [];
  let hasMore = true;
  let sinceId = '';
  let pageNo = 1;
  const pageSize = 100;

  do {
    console.log(`获取第${pageNo}页笔记...`);
    
    const response = await getNotesFromGet(pageSize, sinceId);
    
    if (response?.list) {
      allNotes.push(...response.list);
      hasMore = response.has_more;
      
      if (response.list.length > 0) {
        const lastNote = response.list[response.list.length - 1];
        sinceId = lastNote?.id || '';
      }
    } else {
      hasMore = false;
    }
    
    console.log(`第${pageNo}页获取到${response?.list?.length || 0}条笔记，累计${allNotes.length}条`);
    pageNo++;
    
    // 添加延迟避免请求过快
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } while (hasMore && sinceId.length > 0);

  console.log(`总共获取到${allNotes.length}条GET笔记`);
  return allNotes;
}

/**
 * 获取飞书多维表格中已导入的笔记ID
 */
async function getImportedNoteIds() {
  console.log('获取飞书中已导入的笔记ID...');
  
  const token = await getFeishuToken();
  let pageToken = '';
  let hasMore = false;
  const allRecords = [];

  do {
    const url = new URL(feishuApi.QUERY_RECORDS);
    url.searchParams.append('page_size', '300');
    if (pageToken) {
      url.searchParams.append('page_token', pageToken);
    }

    const response = await makeRequest(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: {
        field_names: ['笔记id'],
      },
    });

    if (!response.ok) {
      throw new Error(`获取飞书记录失败: ${response.status} ${JSON.stringify(response.data)}`);
    }

    const data = response.data.data;
    const records = data.items.map((item) => ({
      note_id: item.fields['笔记id'][0].text,
      record_id: item.record_id,
    }));

    allRecords.push(...records);
    hasMore = data.has_more;
    pageToken = data.page_token;
  } while (hasMore);

  importedNoteIds = allRecords.map(record => record.note_id);
  console.log(`飞书中已有${importedNoteIds.length}条笔记记录`);
  
  return importedNoteIds;
}

/**
 * 将笔记转换为飞书记录格式
 */
function convertNotesToFeishuRecords(notes) {
  return notes.map((note) => {
    const fields = {
      "标题": note.title,
      "笔记内容": note.content,
      "笔记内容（纯文本）": note.body_text,
      "笔记id": note.note_id,
      "笔记类型": [`${note.entry_type}_${note.note_type}`],
      "标签": note.tags.map((tag) => tag.name),
      ...(note.attachments && note.attachments[0]?.type === "link" ? {
        "原文链接": {
          "text": note.attachments[0].title || note.title,
          "link": note.attachments[0].url
        }
      } : {}),
      "笔记创建时间": note.created_at,
      "上次编辑时间": note.edit_time
    };
    return { fields };
  });
}

/**
 * 批量创建飞书记录
 */
async function batchCreateFeishuRecords(notes) {
  if (notes.length === 0) {
    console.log('没有需要导入的笔记');
    return;
  }

  console.log(`开始导入${notes.length}条笔记到飞书...`);
  
  const token = await getFeishuToken();
  const records = convertNotesToFeishuRecords(notes);
  
  // 分批处理，每次最多500条记录
  const batchSize = 500;
  let successCount = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`导入第${Math.floor(i/batchSize) + 1}批，共${batch.length}条记录...`);
    
    try {
      const response = await makeRequest(feishuApi.BATCH_CREATE_RECORDS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: {
          records: batch,
        },
      });

      if (!response.ok) {
        console.error(`批量导入失败: ${response.status} ${JSON.stringify(response.data)}`);
      } else {
        successCount += batch.length;
        console.log(`第${Math.floor(i/batchSize) + 1}批导入成功`);
      }
    } catch (error) {
      console.error(`批量导入异常:`, error);
    }
    
    // 添加延迟避免请求过快
    if (i + batchSize < records.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`导入完成，成功导入${successCount}条笔记`);
}

/**
 * 验证配置
 */
function validateConfig() {
  const requiredFields = [
    'GET_NOTES_TOKEN',
    'FEISHU_APP_ID', 
    'FEISHU_APP_SECRET',
    'FEISHU_APP_TOKEN',
    'FEISHU_TABLE_ID'
  ];
  
  const missingFields = requiredFields.filter(field => !process.env[field]);
  
  if (missingFields.length > 0) {
    console.error('缺少必要的环境变量:', missingFields.join(', '));
    process.exit(1);
  }
  
  console.log('配置验证通过');
}

/**
 * 主函数
 */
async function main() {
  console.log('=== GET笔记同步到飞书多维表格 ===');
  console.log(`开始时间: ${new Date().toLocaleString()}`);
  
  try {
    // 验证配置
    validateConfig();
    
    // 获取飞书中已导入的笔记ID
    await getImportedNoteIds();
    
    // 获取所有GET笔记
    const allNotes = await getAllNotesFromGet();
    
    // 筛选出未导入的笔记
    const newNotes = allNotes.filter(note => !importedNoteIds.includes(note.note_id));
    
    console.log(`总笔记数: ${allNotes.length}, 已导入: ${importedNoteIds.length}, 待导入: ${newNotes.length}`);
    
    if (newNotes.length === 0) {
      console.log('所有笔记已同步，无需导入');
      return;
    }
    
    // 批量导入新笔记
    await batchCreateFeishuRecords(newNotes);
    
    console.log('同步完成!');
    
  } catch (error) {
    console.error('同步过程中发生错误:', error);
    process.exit(1);
  } finally {
    console.log(`结束时间: ${new Date().toLocaleString()}`);
  }
}

// 如果直接运行此脚本，则执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  main,
  getNotesFromGet,
  getAllNotesFromGet,
  getImportedNoteIds,
  batchCreateFeishuRecords,
};
