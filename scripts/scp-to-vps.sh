#!/bin/bash
KEY='/mnt/c/Users/manso/.ssh/adminvps_deploy'
B='/mnt/c/Users/manso/Desktop/разработка/your-ai-companion-main'
R='/opt/mansoni/app'
chmod 600 "$KEY"
for f in 'infra/calls/sfu.service' 'infra/calls/pm2.config.cjs' 'infra/calls/nginx-sfu-ru.conf' 'server/sfu/Dockerfile' '.github/workflows/deploy-calls-sfu.yml'; do
  scp -i "$KEY" -o StrictHostKeyChecking=no "$B/$f" "root@155.212.245.89:$R/$f" && echo "OK: $f" || echo "FAIL: $f"
done
echo "=== Running bootstrap ==="
ssh -i "$KEY" -o StrictHostKeyChecking=no root@155.212.245.89 "bash /opt/mansoni/app/infra/calls/bootstrap-sfu-node.sh /opt/mansoni/app ru 2>&1 | tail -60"
