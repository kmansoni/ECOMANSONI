import { ConnectionPool, IConnectionPoolOptions } from 'mssql';

// Конфигурация подключения к MSSQL
// Заполните реальными значениями из вашей среды
const mssqlConfig: IConnectionPoolOptions = {
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || 'YourStrong!Passw0rd',
  server: process.env.MSSQL_SERVER || 'localhost',
  database: process.env.MSSQL_DATABASE || 'mansoni',
  options: {
    encrypt: process.env.MSSQL_ENCRYPT ?? 'true' === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_CERT ?? 'false' === 'true',
    enableArithAbort: true,
    instanceName: process.env.MSSQL_INSTANCE, // Если нужен именованный экземпляр
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  }
};

let pool: ConnectionPool | null = null;

/**
 * Создает и возвращает пул подключений к MSSQL
 */
export async function getMssqlPool(): Promise<ConnectionPool> {
  if (pool && !pool.connecting) {
    return pool;
  }

  pool = new ConnectionPool(mssqlConfig);
  
  try {
    await pool.connect();
    console.log('Подключено к MSSQL серверу');
    return pool;
  } catch (err) {
    console.error('Ошибка подключения к MSSQL:', err);
    pool = null;
    throw err;
  }
}

/**
 * Закрывает пул подключений
 */
export async function closeMssqlPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Пул подключений к MSSQL закрыт');
  }
}

/**
 * Выполняет SQL запрос и возвращает результаты
 */
export async function queryMssql<T = any>(query: string, params?: any[]): Promise<T[]> {
  const pool = await getMssqlPool();
  const request = pool.request();
  
  // Добавляем параметры, если они предоставлены
  if (params) {
    params.forEach((param, index) => {
      request.input(`p${index}`, param);
    });
  }
  
  const result = await request.query(query);
  return result.recordset as T[];
}

/**
 * Выполняет хранимую процедуру
 */
export async function executeProcedure<T = any>(
  procedureName: string, 
  params: Record<string, any> = {}
): Promise<T[]> {
  const pool = await getMssqlPool();
  const request = pool.request();
  
  // Добавляем параметры процедуры
  Object.entries(params).forEach(([name, value]) => {
    request.input(name, value);
  });
  
  const result = await request.execute(procedureName);
  return result.recordset as T[];
}

export default {
  getMssqlPool,
  closeMssqlPool,
  queryMssql,
  executeProcedure
};