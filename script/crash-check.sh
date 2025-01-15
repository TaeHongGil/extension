
############ 타겟폴더
ndkHome=$1/Contents/NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-addr2line
targetPath=$2
errorCode=$3

#ndk파일 없으면 exit
if [ ! -e $ndkHome ]; then
    echo "$ndkHome not exist"
    exit
fi

#타겟파일 없으면 exit
if [ ! -e $targetPath ]; then
    echo "$targetPath not exist"
    exit
fi

echo "


"
$ndkHome -C -f -e $targetPath $errorCode

echo "


"