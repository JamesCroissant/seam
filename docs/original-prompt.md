# 最初のプロンプト（原文）

Seam の設計を始めるときに渡したプロンプトです。手を加えずにそのまま残しています。
このあと会話の中で決めたこと・変えたことは [vision.md](vision.md) にまとめています。

---

あなたは、Webフレームワーク設計にくわしいシニアエンジニアです。
私が作ろうとしている「フロントエンドとバックエンドの境界をシンプルにする、Web標準ベースのReactフルスタックフレームワーク」の設計を、一緒に考えてください。

# 私について
- フロントエンドエンジニア（React / TypeScript / Next.js が主な技術）
- これまで Next.js を使ってきたが、Next.js 独自の知識が多すぎることに不満がある

# 作りたい理由（Next.js への不満）
- Server Actions、'use client' / 'use server' の境界、RSC独自の仕組みなど、Web標準ではない独自の考え方を覚える必要がある
- キャッシュが複雑（以前の暗黙のキャッシュ、revalidatePath / revalidateTag、Next.js 16 以降の Cache Components・'use cache'・cacheLife・cacheTag・Partial Prefetching など）
- コンパイラの変換が多く、書いたコードと実際に動くコードがちがうので、挙動を追いにくい

# 目指す方向
- Hono のように軽量で、コアは Web 標準（Request / Response / ReadableStream / FormData / fetch など）だけで作る
- コアは `(Request) => Promise<Response>` の1つの関数
- インフラごとにアダプターを用意する（Node.js、Bun、Deno、Cloudflare Workers など）。Node.js だけは IncomingMessage と Request/Response の変換が必要
- 考え方は「境界をなくす」ではなく「境界を見えるようにして、越えるのを楽にする」

# 設計の方針（ここまでに決めたこと）
1. データの読み込みは route ごとの loader（GET）
2. データの書き込みは action。HTML の <form method="post"> で動き、終わったら 303 リダイレクト → GET で loader が再実行される。revalidate のような専用APIは作らない
3. JS が使えるときは、クライアントがフォーム送信を横取りして fetch で同じ処理をする。サーバー側のコードは JS あり・なしで同じ
4. キャッシュはフレームワークが持たず、HTTP の Cache-Control ヘッダーにまかせる
5. ビルド時の変換（魔法）は最小限にする。必要なのは「サーバー用コードをクライアント用バンドルに入れない」ことと、'use server' の変換くらい。変換後の姿はドキュメントで明確にする
6. 描画は SSR が土台。遅い部分はストリーミング（ReadableStream）。部分更新は「HTMLのかけら」を返す方式。細かい操作が必要な部分だけアイランドとして React をハイドレーションする
7. 入れ子のレイアウトは、ルートを入れ子にしてそれぞれに loader を持たせる（Remix / React Router の考え方）。loader は並行して動かす

# TanStack Start から取り入れたい考え方
- 「RSC はデータである」：サーバーコンポーネントを、サーバーが持つツリーではなく、取得・キャッシュ・表示できるデータ（React Flight のストリーム）として扱う
- ツリーの持ち主はクライアント（クライアントファースト）
- Composite Components のような「slot（差しこみ口）」の仕組み：サーバーがUIの骨組みを描画し、クライアントが children / render props / component props で操作できる部品を差しこむ
- サーバーとの境界を明示的にする
- ただし RSC は必須ではなく、使いたい場所だけで使えるオプションにしたい

# ただし、書き方は React 標準に寄せたい
- TanStack Start は 'use server' を使わず createServerFn で境界を作るが、私は React 標準の 'use server' をうまく使いたい
- 案：書き込み（mutation）は 'use server' を使う（<form action={fn}> や useActionState と組み合わせられる）。読み込みは GET の loader / 関数にして Cache-Control でキャッシュできるようにする（'use server' は基本 POST なのでキャッシュと相性が悪いため）
- 'use server' の関数は「決まった URL の普通の POST エンドポイント（中身は Request → Response）」にコンパイルされる、と明確に決めたい
- 'use client' は React のルール通りに使う

# 気をつけたいこと
- Hono の弱点（フォルダ構成などの決まりがなくチームで書き方がバラバラになる、RPC の型推論が重くなりやすい、型のためにメソッドチェーンが必要、ランタイムごとの差）を、必要な部分だけ決まりを作ることで補いたい
- 「ページの一部だけキャッシュしたい」という Next.js の Cache Components が解決している問題は、HTTP の Cache-Control だけでは難しい。ページの部分ごとに別URLにして、それぞれに Cache-Control を付け、HTMLのかけらやRSCデータとして組み立てる、などの方法を考えたい
- 「やらないこと」をはっきり決めたい

# お願いしたいこと
次の順番で答えてください。
1. 設計の原則（5〜7個）と、それぞれの理由
2. 1回のリクエストの流れを、具体的なステップで追った説明（GET でページを表示する場合、フォームで POST する場合、JS ありで部分更新する場合、RSC をデータとして取得する場合）
3. 開発者が書くコードのイメージ（route ファイル、loader、'use server' の action、slot を使う例）
4. 'use server' をどう変換するか（変換前と変換後のコード）
5. コアの最小実装（TypeScript）と、各アダプター（Node.js、Bun、Deno、Cloudflare Workers）の実装イメージ
6. ビルドの構成（Vite プラグインで何をするか）
7. 最初に作る範囲（MVP）と、そのあとのロードマップ
8. この設計のデメリットとトレードオフ、Next.js / React Router / TanStack Start / Remix 3 / HonoX との比較

# 回答のルール
- 中学生でも分かるような、やさしく自然な日本語で書いてください。かたい言い回しや、むずかしすぎる専門用語は避けてください
- 抽象的な説明より、具体的なステップやコードで説明してください
- 根っこの考え方（なぜそうするのか）から説明してください
- React、Vite、@vitejs/plugin-rsc などのライブラリの今のAPIについて、確信がないことは推測で書かず、「確認が必要」とはっきり書いてください

---

# 途中で追加した方針（原文）

## React Router v7 との関係

私の設計はreact router v7と違って、動く部分だけJSを送るという設計です

React Router v7（フレームワークモード）は、すでに次のものを持っている：
- loader / action、<Form> による JS なしでも動くフォーム、action 後の loader 自動再実行
- Web 標準の Request / Response
- headers の export による Cache-Control でのキャッシュ
- 入れ子ルートと loader の並行実行
- 各インフラ向けのアダプター、Vite プラグイン

## このフレームワークの中心

つまり、私の方針1〜4・7はほぼ React Router v7 と同じ。自作する意味を出すため、次の点を「このフレームワークの中心」にしたい：
1. ブラウザに送る JS を減らす：React Router はハイドレーション後にアプリ全体が SPA として動き、ページのコンポーネントの JS を基本的に全部送る。私のフレームワークは HTML のかけら方式とアイランドで、動く部分だけ JS を送る
2. RSC をデータとして扱う：React Router の RSC 対応は「loader が React 要素も返せる」形で試験中。私は TanStack Start のように、RSC をデータとして取得・キャッシュし、slot で合成する
3. 書き込みは 'use server' 中心（React Router は route の action が中心）
4. コアを Hono くらい小さくし、API の数を絞る（clientLoader、useFetcher、shouldRevalidate などに相当するものを増やしすぎない）
5. 必要なら Hono のような型付き API / RPC もコアに入れる

## 気をつけたいこと

- Hono の弱点（フォルダ構成などの決まりがなくチームで書き方がバラバラになる、RPC の型推論が重くなりやすい、型のためにメソッドチェーンが必要、ランタイムごとの差）を、必要な部分だけ決まりを作ることで補いたい
- アイランド方式の弱点（島どうしで状態を共有しにくい、ページ移動で状態が消えやすい、アプリっぽい画面には向かない、どこを島にするか毎回決める必要がある）と、HTML かけら方式の弱点（操作のたびにサーバーと通信する、細かい動きが苦手、サーバーの負担が増える、更新の流れが追いにくくなる）への対策も考えたい
- 「ページの一部だけキャッシュしたい」という Next.js の Cache Components が解決している問題は、HTTP の Cache-Control だけでは難しい。ページの部分ごとに別URLにして、それぞれに Cache-Control を付け、HTMLのかけらやRSCデータとして組み立てる、などの方法を考えたい
- 「やらないこと」をはっきり決めたい

## ナビゲーションについての指示

案A で始めます。ただし「SPA のルーターは作らない」は「React の木全体を持つ SPA ルーターは作らない。HTML を差しかえる小さなナビゲーション用スクリプトは持つ」と書きなおしてください。また、案A の MVP に、①残した島に URL の変化を知らせる仕組み、②スクロール位置とフォーカスの扱い、③読みこみ中の表示、を入れてください。
