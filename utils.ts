
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
    // 1. Basic cleaning
    let query = sql
        .replace(/--.*$/gm, '') // Remove single line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    // 2. Remove FROM clause (aggressive regex to catch quoted/unquoted table names)
    // Matches FROM followed by (backticked string OR single quoted OR double quoted OR non-whitespace chars)
    query = query.replace(/FROM\s+(`[^`]+`|'[^']+'|"[^"]+"|[\S]+)\s*/gi, '');

    // 3. Extract Clauses (SELECT, WHERE, GROUP BY, ORDER BY, LIMIT)
    const clauses: Record<string, string> = {};
    const keywords = ['SELECT', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT'];
    
    // Helper to find keywords
    let currentPos = 0;
    while (currentPos < query.length) {
        let bestKeyword = '';
        let bestIndex = -1;

        for (const kw of keywords) {
            const regex = new RegExp(`\\b${kw}\\b`, 'i');
            const match = query.substring(currentPos).match(regex);
            if (match && match.index !== undefined) {
                const absIndex = currentPos + match.index;
                if (bestIndex === -1 || absIndex < bestIndex) {
                    bestIndex = absIndex;
                    bestKeyword = kw;
                }
            }
        }

        if (bestIndex === -1) break; // No more keywords

        // Capture previous clause content if we found a new keyword
        const previousKeywordMatch = Object.keys(clauses).find(k => k === query.substring(0, bestIndex).trim()); 
        
        // Actually, simpler approach: Split by keywords regex, but retain delimiters
        break; 
    }
    
    // Alternative Parsing Strategy: Regex Replacements in Logical Order for Pipe Syntax
    
    const pipes: string[] = [];
    
    // --- WHERE -> filter ---
    const whereMatch = query.match(/WHERE\s+(.*?)(?=$|GROUP BY|ORDER BY|LIMIT)/i);
    if (whereMatch) {
        let body = whereMatch[1].trim();
        
        // Map LIKE '%pattern%' -> like /pattern/
        // Removes wrapping % wildcards, escapes regex chars if needed
        body = body.replace(/LIKE\s+'%?([^']*)%?'/gi, (m, c) => `like /${c}/`);
        body = body.replace(/LIKE\s+"%?([^"]*)%?"/gi, (m, c) => `like /${c}/`);
        
        // Map standard operators
        body = body.replace(/\s+AND\s+/gi, ' and ');
        body = body.replace(/\s+OR\s+/gi, ' or ');
        body = body.replace(/\s+NOT\s+/gi, ' not ');
        
        pipes.push(`filter ${body}`);
    }

    // --- SELECT (+ GROUP BY) -> fields / stats ---
    const selectMatch = query.match(/^SELECT\s+(.*?)(?=$|FROM|WHERE|GROUP BY|ORDER BY|LIMIT)/i);
    if (selectMatch) {
        let body = selectMatch[1].trim();
        const groupByMatch = query.match(/GROUP BY\s+(.*?)(?=$|ORDER BY|LIMIT)/i);
        
        // Heuristic: If aggregation functions are present, use 'stats', otherwise 'fields'
        const isAgg = /\b(count|avg|sum|min|max|stddev|pct|bin)\s*\(/.test(body);
        
        if (body === '*') {
            if (!isAgg) {
                 pipes.push('fields @timestamp, @message, @logStream, @log');
            }
        } else {
            let cmd = 'fields';
            if (isAgg || groupByMatch) {
                cmd = 'stats';
            }
            
            let commandStr = `${cmd} ${body}`;
            if (groupByMatch) {
                commandStr += ` by ${groupByMatch[1].trim()}`;
            }
            pipes.push(commandStr);
        }
    }

    // --- ORDER BY -> sort ---
    const orderMatch = query.match(/ORDER BY\s+(.*?)(?=$|LIMIT)/i);
    if (orderMatch) {
        pipes.push(`sort ${orderMatch[1].trim()}`);
    }

    // --- LIMIT -> limit ---
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
        pipes.push(`limit ${limitMatch[1].trim()}`);
    }

    // Fallback: If no pipes generated (e.g. empty or parse fail), return raw but create a basic query
    if (pipes.length === 0) {
        return 'fields @timestamp, @message, @logStream, @log | sort @timestamp desc | limit 20';
    }

    return pipes.join(' | ');
};
