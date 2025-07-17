# ローカル開発環境セットアップガイド

## 前提条件

- Node.js 18.x 以上
- Docker Desktop
- Git

## セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env`ファイルが作成されています。必要に応じて値を更新してください：
- Stripe、LINE、Agoraの本番キーを設定する場合は、各サービスから取得したキーを設定

### 3. Dockerコンテナの起動
```bash
npm run docker:up
```

これにより以下のサービスが起動します：
- PostgreSQL (localhost:5432)
- Redis (localhost:6379)
- DynamoDB Local (http://localhost:8000)
- MinIO/S3 (http://localhost:9000, Console: http://localhost:9001)
- MailHog (http://localhost:8025)

### 4. ローカル環境のセットアップ
```bash
npm run setup:local
```

これによりDynamoDBテーブルとS3バケットが作成されます。

### 5. データベースマイグレーション
```bash
npm run migrate:dev
```

### 6. 開発サーバーの起動
```bash
npm run dev
```

APIは http://localhost:3000 で利用可能になります。

## 一括起動コマンド

すべてを一度に起動する場合：
```bash
npm run start:local
```

## 開発コマンド

### TypeScriptのチェック
```bash
npm run typecheck
```

### ビルド
```bash
npm run build
```

### テスト
```bash
npm test
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Dockerログの確認
```bash
npm run docker:logs
```

### Docker環境の停止
```bash
npm run docker:down
```

## API エンドポイント

### ヘルスチェック
```bash
curl http://localhost:3000/health
```

### 予約作成（認証が必要）
```bash
POST http://localhost:3000/bookings
```

## トラブルシューティング

### Dockerコンテナが起動しない場合
1. Docker Desktopが起動していることを確認
2. ポートが使用されていないか確認
3. `docker-compose down -v`で完全にクリーンアップしてから再起動

### データベース接続エラー
1. PostgreSQLコンテナが起動していることを確認
2. `.env`ファイルのDB設定を確認
3. `docker-compose logs postgres`でログを確認

### DynamoDB接続エラー
1. DynamoDBコンテナが起動していることを確認
2. http://localhost:8000/shell でDynamoDB Webシェルにアクセスできるか確認

## 開発のヒント

1. **ホットリロード**: serverless-offlineは自動的にコードの変更を検知します
2. **メール確認**: MailHog (http://localhost:8025) で送信されたメールを確認できます
3. **S3ファイル**: MinIO Console (http://localhost:9001) でアップロードされたファイルを確認できます
   - ユーザー名: minioadmin
   - パスワード: minioadmin

## 次のステップ

1. 機能の実装
2. テストの追加
3. APIドキュメントの作成