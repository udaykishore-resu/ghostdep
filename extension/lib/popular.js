/*
 * Well-known package names per registry. Two jobs:
 *  1. names in these lists are accepted without a network lookup;
 *  2. a name one edit away from one of these is treated as a possible typosquat.
 * The lists are hand-maintained and deliberately short. Extend them freely.
 */
(function (root) {
  'use strict';

  const pypi = `boto3 botocore urllib3 requests setuptools certifi charset-normalizer idna typing-extensions python-dateutil
packaging s3transfer six aiobotocore pyyaml numpy pip s3fs fsspec cryptography google-api-core pydantic attrs cffi pandas
protobuf pycparser jmespath markupsafe platformdirs click rsa pyasn1 jinja2 importlib-metadata zipp pytz pydantic-core wheel
googleapis-common-protos colorama awscli filelock virtualenv cachetools tomli wrapt pluggy pytest google-auth jsonschema pyjwt
annotated-types sqlalchemy psutil pyarrow docutils iniconfig h11 aiohttp yarl multidict anyio sniffio exceptiongroup pyparsing
requests-oauthlib oauthlib httpx httpcore pygments scipy soupsieve beautifulsoup4 tzdata frozenlist aiosignal werkzeug flask
pillow tqdm greenlet decorator isodate pyopenssl distlib async-timeout openpyxl et-xmlfile lxml grpcio requests-toolbelt
more-itertools rich markdown-it-py mdurl tomlkit deprecated pynacl azure-core google-cloud-storage proto-plus asn1crypto
coverage psycopg2-binary psycopg2 psycopg msgpack importlib-resources gitpython regex scikit-learn matplotlib joblib
threadpoolctl kiwisolver cycler fonttools contourpy networkx sympy mpmath torch torchvision torchaudio transformers tokenizers
huggingface-hub safetensors openai anthropic langchain langchain-core langchain-community langchain-openai langgraph tiktoken
fastapi starlette uvicorn gunicorn django djangorestframework celery redis pymongo pymysql alembic mako tensorflow keras
tensorboard opencv-python opencv-python-headless seaborn plotly streamlit gradio jupyter jupyterlab notebook ipython ipykernel
black ruff mypy flake8 isort pylint poetry tox nox pre-commit python-dotenv httplib2 selenium playwright scrapy paramiko fabric
ansible docker kubernetes pyspark dask numba polars duckdb xgboost lightgbm catboost nltk spacy gensim sentence-transformers
datasets accelerate diffusers pydantic-settings typer orjson ujson tenacity loguru structlog sentry-sdk opentelemetry-api
opentelemetry-sdk prometheus-client pyzmq tornado websockets websocket-client sqlmodel peewee marshmallow passlib bcrypt
argon2-cffi python-multipart email-validator jsonpatch tabulate xlrd xlsxwriter python-docx pypdf pypdf2 pymupdf reportlab
markdown pytest-cov pytest-mock pytest-asyncio pytest-xdist hypothesis faker factory-boy responses moto mock shapely geopandas
pyproj h5py statsmodels scikit-image imageio librosa pygame pyqt5 pyside6 uv pipx pipenv twine build hatchling flit cython
pybind11 chromadb faiss-cpu pinecone qdrant-client weaviate-client llama-index ollama litellm instructor boto mcp
google-generativeai google-genai google-cloud-bigquery google-cloud-pubsub azure-storage-blob azure-identity snowflake-connector-python
databricks-sdk mlflow wandb optuna ray airflow apache-airflow prefect dagster dbt-core great-expectations pandera pyodbc
cx-oracle oracledb asyncpg aiosqlite motor elasticsearch opensearch-py kafka-python confluent-kafka pika nats-py grpcio-tools
flask-sqlalchemy flask-cors flask-login flask-migrate django-cors-headers django-filter django-environ whitenoise channels
httptools uvloop watchfiles python-jose itsdangerous blinker aiofiles pyserial pexpect ptyprocess termcolor colorlog pyfiglet
click-plugins prompt-toolkit questionary textual tzlocal pendulum arrow humanize dateparser babel chardet python-magic
python-slugify unidecode inflect jsonpointer pyrsistent toml xmltodict lz4 zstandard brotli pycryptodome pycryptodomex ecdsa
pyotp qrcode opencv-contrib-python pytesseract easyocr moviepy pydub soundfile sounddevice speechrecognition pyttsx3 gtts
bokeh altair dash folium pydeck wordcloud tensorflow-hub tensorflow-datasets onnx onnxruntime jax flax einops timm
pytorch-lightning lightning torchmetrics peft bitsandbytes trl evaluate sentencepiece openai-whisper yfinance ta-lib ccxt
backtrader zipline html5lib mechanize requests-html pyquery feedparser newspaper3k tweepy praw discord-py
python-telegram-bot slack-sdk twilio sendgrid stripe paypalrestsdk boto3-stubs types-requests types-pyyaml`;

  const npm = `lodash react react-dom express axios chalk commander debug typescript tslib moment uuid async fs-extra glob
minimist semver yargs dotenv rxjs vue next webpack @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript
eslint prettier jest mocha chai sinon vite vitest rollup esbuild tailwindcss postcss autoprefixer sass classnames prop-types
redux react-redux @reduxjs/toolkit react-router react-router-dom zustand zod yup formik react-hook-form @tanstack/react-query
@tanstack/react-table swr graphql apollo-server @apollo/client socket.io socket.io-client ws cors body-parser cookie-parser
morgan helmet jsonwebtoken bcrypt bcryptjs passport mongoose mongodb pg mysql mysql2 sqlite3 better-sqlite3 redis ioredis
sequelize prisma @prisma/client typeorm knex nodemon ts-node tsx concurrently cross-env rimraf mkdirp chokidar inquirer ora
yargs-parser node-fetch got superagent cheerio puppeteer playwright @playwright/test jsdom date-fns dayjs luxon ramda
underscore immer nanoid qs form-data multer sharp jquery bootstrap d3 three chart.js recharts @types/node @types/react
@types/react-dom @types/express @types/jest @types/lodash styled-components @emotion/react @emotion/styled @mui/material antd
framer-motion motion lucide-react clsx tailwind-merge class-variance-authority openai @anthropic-ai/sdk langchain
@langchain/core ai @ai-sdk/openai @modelcontextprotocol/sdk hono fastify koa @nestjs/core @nestjs/common @nestjs/cli nuxt svelte
@sveltejs/kit astro @angular/core @angular/cli electron husky lint-staged eslint-config-prettier eslint-plugin-react
@typescript-eslint/parser @typescript-eslint/eslint-plugin turbo lerna nx pm2 winston pino bunyan joi ajv validator marked
markdown-it highlight.js handlebars ejs pug xml2js yaml js-yaml csv-parse papaparse pdf-lib pdfkit nodemailer stripe aws-sdk
@aws-sdk/client-s3 firebase firebase-admin @supabase/supabase-js drizzle-orm drizzle-kit execa shelljs open p-limit lru-cache
bluebird colors color preact strip-ansi supports-color ansi-styles escape-string-regexp mime mime-types iconv-lite safe-buffer
readable-stream through2 core-js regenerator-runtime webpack-cli webpack-dev-server babel-loader css-loader style-loader
html-webpack-plugin create-react-app create-vite create-next-app serve http-server live-server json-server zx npm pnpm yarn
react-native expo @react-navigation/native react-query @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
cypress storybook @storybook/react ts-jest supertest nock msw faker @faker-js/faker dotenv-cli env-cmd express-rate-limit
express-session express-validator connect-redis passport-jwt passport-local argon2 crypto-js node-cron cron bull bullmq
amqplib kafkajs mqtt aws-cdk aws-cdk-lib constructs cdktf serverless wrangler vercel netlify-cli firebase-tools
@google/generative-ai @google/genai ollama cohere-ai @pinecone-database/pinecone chromadb @huggingface/inference
@radix-ui/react-dialog @headlessui/react @heroicons/react react-icons daisyui shadcn react-select react-datepicker
react-toastify sonner react-markdown remark rehype mdx gray-matter next-auth @auth/core @clerk/nextjs lucia iron-session
next-themes i18next react-i18next mobx mobx-react jotai recoil valtio xstate immutable lodash-es rambda fp-ts effect neverthrow
meow cac kleur picocolors boxen figlet cli-table3 prompts enquirer listr2 tar archiver adm-zip unzipper
fast-glob globby micromatch minimatch picomatch ignore find-up resolve pkg-dir read-pkg semver-diff`;

  const crates = `serde serde_json tokio rand clap syn quote proc-macro2 libc log regex anyhow thiserror futures bytes reqwest
hyper itertools lazy_static once_cell chrono uuid tracing async-trait axum actix-web tower tonic prost rayon crossbeam
parking_lot bitflags cfg-if either indexmap hashbrown smallvec num-traits time url http base64 hex sha2 tempfile walkdir toml
serde_yaml env_logger dotenv dotenvy sqlx diesel rusqlite redis mio socket2 nom strum derive_more tokio-util tokio-stream
futures-util pin-project tracing-subscriber rustls openssl ring getrandom memchr aho-corasick unicode-ident ahash dashmap
bincode csv image bevy wasm-bindgen criterion proptest colored indicatif dirs glob semver num nalgebra ndarray polars arrow
crossterm ratatui tui structopt config tera askama warp rocket tower-http serde_with schemars eyre color-eyre miette
flate2 zip tar md-5 sha1 hmac aes rsa ed25519-dalek jsonwebtoken argon2 bcrypt cargo-edit cargo-watch cargo-nextest
ripgrep bat fd-find exa tokei hyperfine just mdbook wasm-pack trunk leptos yew dioxus tauri egui iced wgpu winit`;

  const split = (s) => new Set(s.split(/\s+/).filter(Boolean));

  // Python import names that are NOT the package name. Installing the import name gets you
  // something else (often an abandoned or placeholder project).
  const pypiAliases = {
    sklearn: 'scikit-learn',
    cv2: 'opencv-python',
    yaml: 'pyyaml',
    pil: 'pillow',
    bs4: 'beautifulsoup4',
    dateutil: 'python-dateutil',
    dotenv: 'python-dotenv',
    jwt: 'pyjwt',
    crypto: 'pycryptodome',
    serial: 'pyserial',
    magic: 'python-magic',
    docx: 'python-docx',
    git: 'gitpython',
    attr: 'attrs',
    skimage: 'scikit-image',
    fitz: 'pymupdf',
    jose: 'python-jose',
    slugify: 'python-slugify',
    telegram: 'python-telegram-bot',
    discord: 'discord-py',
    dns: 'dnspython',
    zmq: 'pyzmq',
    win32api: 'pywin32',
    usb: 'pyusb',
    mysqldb: 'mysqlclient',
    openssl: 'pyopenssl',
    googleapiclient: 'google-api-python-client',
  };

  // Commands people run with npx whose package has a DIFFERENT name. `npx tsc` only works when the
  // real package is already installed; otherwise npm downloads whatever package is literally called `tsc`.
  // Every pair was checked against the `bin` field of the package on the right.
  const npmBinAliases = {
    tsc: 'typescript',
    ng: '@angular/cli',
    nest: '@nestjs/cli',
    vue: '@vue/cli',
    babel: '@babel/cli',
    cdk: 'aws-cdk',
    sls: 'serverless',
    netlify: 'netlify-cli',
    firebase: 'firebase-tools',
    sequelize: 'sequelize-cli',
    cap: '@capacitor/cli',
    swc: '@swc/cli',
    tauri: '@tauri-apps/cli',
    'graphql-codegen': '@graphql-codegen/cli',
    commitlint: '@commitlint/cli',
    changeset: '@changesets/cli',
    biome: '@biomejs/biome',
    ncc: '@vercel/ncc',
    wdio: '@wdio/cli',
    lhci: '@lhci/cli',
    postcss: 'postcss-cli',
    remix: '@remix-run/dev',
    'electron-forge': '@electron-forge/cli',
    amplify: '@aws-amplify/cli',
    cdktf: 'cdktf-cli',
    ionic: '@ionic/cli',
    quasar: '@quasar/cli',
    'svelte-kit': '@sveltejs/kit',
    'react-router': '@react-router/dev',
    'mcp-inspector': '@modelcontextprotocol/inspector',
    'openapi-generator-cli': '@openapitools/openapi-generator-cli',
    sanity: '@sanity/cli',
    shopify: '@shopify/cli',
    docusaurus: '@docusaurus/core',
    medusa: '@medusajs/cli',
    strapi: '@strapi/strapi',
  };

  const api = { pypi: split(pypi), npm: split(npm), crates: split(crates.replace(/_/g, '-')), pypiAliases, npmBinAliases };
  root.GhostDepPopular = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
