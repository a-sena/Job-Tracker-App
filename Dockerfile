FROM node:22-alpine AS frontend-build

WORKDIR /src/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS api-build

WORKDIR /src

COPY Directory.Build.props Directory.Packages.props global.json JobTracker.sln ./
COPY src/JobTracker.Domain/JobTracker.Domain.csproj src/JobTracker.Domain/
COPY src/JobTracker.Application/JobTracker.Application.csproj src/JobTracker.Application/
COPY src/JobTracker.Infrastructure/JobTracker.Infrastructure.csproj src/JobTracker.Infrastructure/
COPY src/JobTracker.Api/JobTracker.Api.csproj src/JobTracker.Api/
RUN dotnet restore src/JobTracker.Api/JobTracker.Api.csproj

COPY src/ ./src/
RUN dotnet publish src/JobTracker.Api/JobTracker.Api.csproj \
    --configuration Release \
    --output /out \
    --no-restore \
    /p:UseAppHost=false

COPY --from=frontend-build /src/frontend/dist /out/wwwroot

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime

WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0

COPY --from=api-build --chown=app:app /out/ ./

USER app
EXPOSE 8080

ENTRYPOINT ["dotnet", "JobTracker.Api.dll"]
