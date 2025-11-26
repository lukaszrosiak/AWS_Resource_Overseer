
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
    // Matches FROM followed by a backticked, single-quoted, double-quoted string OR a continuous non-whitespace string (like a path)
    query = query.replace(/FROM\s+(`[^`]+`|'[^']+'|"[^"]+"|[\S]+)\s*/i, '');

    // Map SELECT * -> fields @timestamp, @message, @logStream, @log
    if (/^SELECT\s+\*/i.test(query)) {
        query = query.replace(/^SELECT\s+\*/i, 'fields @timestamp, @message, @logStream, @log');
    }
    // Map SELECT -> fields
    else if (/^SELECT\s/i.test(query)) {
        query = query.replace(/^SELECT\s+/i, 'fields ');
    }

    // Map WHERE -> filter
    query = query.replace(/\s+WHERE\s+/gi, ' | filter ');
    
    // Map LIKE to CloudWatch regex syntax
    // Handles LIKE '%Pattern%' -> like /Pattern/
    // Handles LIKE 'Pattern'   -> like /Pattern/
    const mapLike = (match: string, quote: string, content: string) => {
        // Remove leading/trailing % used for SQL wildcards
        const cleanContent = content.replace(/^%|%$/g, '');
        return `like /${cleanContent}/`;
    };

    // Regex to match LIKE '...' or LIKE "..."
    query = query.replace(/LIKE\s+'([^']+)'/gi, (m, c) => mapLike(m, "'", c));
    query = query.replace(/LIKE\s+"([^"]+)"/gi, (m, c) => mapLike(m, '"', c));

    // Map ORDER BY -> sort
    query = query.replace(/\s+ORDER BY\s+/gi, ' | sort ');
    
    // Map LIMIT -> limit
    query = query.replace(/\s+LIMIT\s+/gi, ' | limit ');

    return query;
};
