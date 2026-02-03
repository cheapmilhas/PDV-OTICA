#!/bin/bash

echo "🚀 PDV Ótica - Push para GitHub"
echo "================================"
echo ""

# Verificar se já existe remote
if git remote get-url origin &> /dev/null; then
    echo "✅ Remote 'origin' já configurado:"
    git remote get-url origin
    echo ""
    read -p "Deseja fazer push? (s/n): " confirm
    if [[ $confirm == [sS] ]]; then
        echo "📤 Fazendo push..."
        git push -u origin main
    fi
else
    echo "❌ Remote 'origin' não configurado!"
    echo ""
    echo "📋 Siga os passos:"
    echo "1. Acesse: https://github.com/new"
    echo "2. Nome: pdv-otica"
    echo "3. Visibilidade: Private"
    echo "4. NÃO inicialize com README"
    echo "5. Crie o repositório"
    echo ""
    read -p "Cole a URL do repositório (ex: https://github.com/usuario/pdv-otica.git): " repo_url

    if [ -n "$repo_url" ]; then
        echo "📌 Adicionando remote..."
        git remote add origin "$repo_url"
        echo "✅ Remote adicionado!"
        echo ""
        echo "📤 Fazendo push..."
        git push -u origin main
        echo ""
        echo "✅ Push concluído!"
        echo "🌐 Acesse: ${repo_url%.git}"
    else
        echo "❌ URL não fornecida. Cancelando."
    fi
fi
