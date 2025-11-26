
export const parseArn = (arn: string) => {
  const parts = arn.split(':');
  const service = parts[2] || 'unknown';
  const resourcePart = parts.slice(5).join(':');
  
  let resourceType = 'resource';
  let resourceId = resourcePart;

  if (resourcePart.includes('/')) {
    const splitRes = resourcePart.split('/');
    resourceType = splitRes[0];
    resourceId = splitRes.slice(1).join('/');
  }

  return { service, resourceType, resourceId };
};

export const mapTags = (tagList: any[]): Record<string, string> => {
    const tags: Record<string, string> = {};
    if (Array.isArray(tagList)) {
        tagList.forEach(t => {
            tags[t.Key] = t.Value;
        });
    }
    return tags;
};

export const transpileSqlToInsights = (sql: string): string => {
    let query = sql.trim();
    
    // Remove FROM clause 
    query = query.replace(/FROM\s+(`[^`]+`|'[^']+'|"[^"]+"|[\S]+)\s*/i, '');

    // Map SELECT -> fields
    if (/^SELECT\s/i.test(query)) {
        query = query.replace(/^SELECT\s+/i, 'fields ');
    }

    // Map WHERE -> filter
    query = query.replace(/\s+WHERE\s+/gi, ' | filter ');
    
    // Map LIKE to CloudWatch regex syntax
    query = query.replace(/LIKE\s+'%([^%]+)%'/gi, 'like /$1/');
    query = query.replace(/LIKE\s+'([^']+)'/gi, 'like /$1/');
    query = query.replace(/LIKE\s+"%([^%]+)%"/gi, 'like /$1/');
    query = query.replace(/LIKE\s+"([^"]+)"/gi, 'like /$1/');

    // Map ORDER BY -> sort
    query = query.replace(/\s+ORDER BY\s+/gi, ' | sort ');
    
    // Map LIMIT -> limit
    query = query.replace(/\s+LIMIT\s+/gi, ' | limit ');

    return query;
};
