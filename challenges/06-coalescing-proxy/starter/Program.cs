using System.Net;

var o = new Dictionary<string, string>();
for (int i = 0; i + 1 < args.Length; i += 2) o[args[i].TrimStart('-')] = args[i + 1];
int port = int.Parse(o["port"]);

var builder = WebApplication.CreateSlimBuilder();
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, port));
var app = builder.Build();
app.Run(async ctx =>
{
    if (ctx.Request.Path == "/__health")
    {
        await ctx.Response.WriteAsync("ok");
        return;
    }
    ctx.Response.StatusCode = 501;
    await ctx.Response.WriteAsync("not implemented");
});
app.Run();
