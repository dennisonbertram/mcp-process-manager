# Troubleshooting Guide

This guide covers common issues and debugging steps for the MCP Process Manager.

## Common Issues

### 1. Server Won't Start

**Symptoms:**
- Server fails to initialize
- Error messages about missing dependencies or configuration

**Solutions:**
- Verify all required environment variables are set
- Check Node.js version (requires Node 18+)
- Run `npm install` to ensure all dependencies are installed
- Verify `package.json` scripts are correct

**Debug Command:**
```bash
npm run build && npm start
```

### 2. Authentication Failures

**Symptoms:**
- Tools return authentication errors
- Unable to connect to process management systems

**Solutions:**
- Verify API keys/tokens are correctly set in environment variables
- Check token expiration dates
- Ensure proper permissions are granted for the service account
- Test authentication separately using service documentation

**Debug Command:**
```bash
# Test basic authentication
curl -H "Authorization: Bearer $YOUR_TOKEN" https://api.example.com/test
```

### 3. Tool Execution Errors

**Symptoms:**
- Tools fail with "Tool not found" or execution errors
- Inconsistent behavior across different tools

**Solutions:**
- Verify tool names match exactly as defined in the server
- Check tool parameters are correctly formatted
- Ensure the MCP client is using the correct protocol version
- Review server logs for detailed error messages

**Debug Command:**
```bash
# Test tool listing
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run start
```

### 4. Connection Issues

**Symptoms:**
- MCP client cannot connect to the server
- Timeouts or connection refused errors

**Solutions:**
- Verify server is running on the correct port/host
- Check firewall settings and network connectivity
- Ensure STDIO transport mode is properly configured
- Test basic connectivity with a simple echo command

**Debug Command:**
```bash
# Test STDIO connection
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | npm run start
```

### 5. Performance Issues

**Symptoms:**
- Slow response times
- High memory/CPU usage
- Process monitoring delays

**Solutions:**
- Review resource limits and system requirements
- Check for memory leaks in long-running processes
- Optimize database queries if applicable
- Enable caching where appropriate

**Debug Command:**
```bash
# Monitor resource usage
top -p $(pgrep -f "node.*server")
```

### 6. Test Failures

**Symptoms:**
- Unit/integration tests failing
- E2E tests timing out

**Solutions:**
- Ensure test environment matches production setup
- Check for race conditions in concurrent tests
- Verify mock data and test fixtures are up to date
- Run tests individually to isolate issues

**Debug Command:**
```bash
# Run tests with verbose output
npm test -- --verbose
```

## Debugging Steps

### 1. Enable Debug Logging

Add debug logging to your environment:
```bash
export DEBUG=mcp:*
npm run start
```

### 2. Check Server Logs

Review server output for error messages:
```bash
npm run start 2>&1 | tee server.log
```

### 3. Validate Configuration

Use the configuration validation tool:
```bash
node scripts/validate-config.js
```

### 4. Test Individual Components

Test components in isolation:
- Authentication: Test API key validation
- Tools: Test individual tool execution
- Resources: Test resource access
- Prompts: Test prompt generation

### 5. Environment Validation

Verify your environment setup:
```bash
# Check Node version
node --version

# Check dependencies
npm list --depth=0

# Check environment variables
env | grep -E "(API|TOKEN|KEY)"
```

## Getting Help

If you continue to experience issues:

1. Check the [GitHub Issues](https://github.com/your-org/mcp-process-manager/issues) for similar problems
2. Review the [API Documentation](api.md) for correct usage
3. Enable debug logging and include relevant logs in your issue report
4. Provide your environment details (Node version, OS, etc.)

## Prevention Tips

- Always test configuration changes in a staging environment
- Keep dependencies updated and review changelogs
- Monitor server logs regularly for early warning signs
- Use the provided Docker setup for consistent environments
- Run the full test suite before deploying changes