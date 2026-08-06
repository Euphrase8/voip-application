import sqlite3
conn = sqlite3.connect(r'backend/voip.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print('Tables:', [t[0] for t in tables])
for t in tables:
    cursor.execute(f'SELECT COUNT(*) FROM {t[0]}')
    count = cursor.fetchone()[0]
    print(f'  {t[0]}: {count} records')
cursor.execute('SELECT id, username, extension, role, status FROM users')
print('\nUsers:')
for row in cursor.fetchall():
    print(f'  ID={row[0]} {row[1]} Ext={row[2]} Role={row[3]} Status={row[4]}')
conn.close()
