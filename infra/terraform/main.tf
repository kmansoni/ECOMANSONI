terraform {
  required_version = ">= 1.6"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket   = "mansoni-terraform-state"
    key      = "prod/terraform.tfstate"
    region   = "us-east-1"
    endpoint = "https://s3.timeweb.cloud"
  }
}

# ── Переменные ────────────────────────────────────────────────────────────────

variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "ssh_public_key" {
  type = string
}

# ── Провайдеры ────────────────────────────────────────────────────────────────

provider "hcloud" {
  token = var.hcloud_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ── SSH ключ ──────────────────────────────────────────────────────────────────

resource "hcloud_ssh_key" "mansoni" {
  name       = "mansoni-deploy"
  public_key = var.ssh_public_key
}

# ── Firewall ──────────────────────────────────────────────────────────────────

resource "hcloud_firewall" "mansoni" {
  name = "mansoni-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # TURN/STUN для звонков
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "3478"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "udp"
    port      = "3478"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "udp"
    port      = "49160-49200"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ── Основной сервер ───────────────────────────────────────────────────────────

resource "hcloud_server" "mansoni_app" {
  name        = "mansoni-app"
  image       = "ubuntu-24.04"
  server_type = "cx31"   # 2 vCPU, 8GB RAM, 80GB SSD
  location    = "hel1"   # Helsinki (ближе к РФ)
  ssh_keys    = [hcloud_ssh_key.mansoni.id]

  firewall_ids = [hcloud_firewall.mansoni.id]

  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y docker.io docker-compose-plugin git curl
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ubuntu
  EOF

  labels = {
    project = "mansoni"
    env     = "production"
  }
}

# ── TURN сервер (отдельный для звонков) ───────────────────────────────────────

resource "hcloud_server" "mansoni_turn" {
  name        = "mansoni-turn"
  image       = "ubuntu-24.04"
  server_type = "cx21"   # 2 vCPU, 4GB RAM
  location    = "hel1"
  ssh_keys    = [hcloud_ssh_key.mansoni.id]

  firewall_ids = [hcloud_firewall.mansoni.id]

  labels = {
    project = "mansoni"
    role    = "turn"
  }
}

# ── Floating IP (не меняется при пересоздании сервера) ────────────────────────

resource "hcloud_floating_ip" "mansoni" {
  type          = "ipv4"
  home_location = "hel1"
  description   = "mansoni.ru production IP"
}

resource "hcloud_floating_ip_assignment" "mansoni" {
  floating_ip_id = hcloud_floating_ip.mansoni.id
  server_id      = hcloud_server.mansoni_app.id
}

# ── DNS записи (Cloudflare) ───────────────────────────────────────────────────

resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  value   = hcloud_floating_ip.mansoni.ip_address
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  value   = hcloud_floating_ip.mansoni.ip_address
  type    = "A"
  proxied = true
}

resource "cloudflare_record" "turn" {
  zone_id = var.cloudflare_zone_id
  name    = "turn"
  value   = hcloud_server.mansoni_turn.ipv4_address
  type    = "A"
  proxied = false  # TURN не через Cloudflare proxy
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "app_server_ip" {
  value = hcloud_server.mansoni_app.ipv4_address
}

output "turn_server_ip" {
  value = hcloud_server.mansoni_turn.ipv4_address
}

output "floating_ip" {
  value = hcloud_floating_ip.mansoni.ip_address
}
